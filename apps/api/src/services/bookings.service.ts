import mongoose, { type FilterQuery,Types } from 'mongoose';

import { config, logger } from '../config';
import { AuditLogModel } from '../models/admin.model';
import { type BookingDocument, BookingInventoryModel, BookingModel } from '../models/bookings.model';
import { VenueModel } from '../models/courts.model';
import { PaymentAttemptModel } from '../models/payments.model';
import { VenueStaffAssignmentModel } from '../models/users.model';
import type { JwtPayload } from '../types/auth';
import type { BookingStatus } from '../types/enums';
import type { SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginateWithMeta } from '../utils/paginate';
import { withLegacyPagination } from '../utils/pagination';
import { parseSort, type SortWhitelist } from '../utils/sort';
import { localDateParts } from '../utils/timezone';
import {
  activeBookingFilter,
  calculateAvailability,
  loadAvailabilityContext,
  slotKeys,
} from './availability.service';
import { enqueueNotification } from './notifications.service';
import { requestRefund } from './payments.service';

const BOOKING_SORT_WHITELIST: SortWhitelist = {
  startAt: 1,
  createdAt: 1,
  updatedAt: 1,
  status: 1,
  amountMinor: 1,
};

const BOOKING_SORT_FALLBACK: SortSpec = { startAt: -1 };

const NON_CANCELLABLE_STATUSES: BookingStatus[] = ['cancelled', 'completed', 'no_show'];

export interface CreateHoldInput {
  userId: string;
  venueId: string;
  pitchId: string;
  startAt: Date;
  durationMinutes: number;
  idempotencyKey: string;
}

export interface CancelBookingInput {
  bookingId: string;
  actor: JwtPayload;
  reason: string;
  idempotencyKey: string;
}

export interface ListBookingsQuery {
  page: number;
  limit: number;
  userId?: string;
  status?: BookingStatus;
  from?: Date;
  to?: Date;
  venueId?: string;
  sort?: string;
}

// ---------------------------------------------------------------- access control

/** A booking is visible to its owner or to an authorized operator of its venue. */
export async function assertBookingAccess(bookingId: string, actor: JwtPayload): Promise<void> {
  if (actor.role === 'admin') return;

  const booking = await BookingModel.findById(bookingId).select('userId venueId');
  if (!booking) throw ApiError.notFound('Booking');

  if (actor.role === 'customer') {
    if (booking.userId.toString() !== actor.sub) {
      throw ApiError.forbidden('You do not have access to this booking');
    }
    return;
  }

  if (actor.role === 'venue_owner') {
    if (!(await VenueModel.exists({ _id: booking.venueId, ownerId: actor.sub }))) {
      throw ApiError.forbidden('You do not have access to this booking');
    }
    return;
  }

  if (actor.role === 'venue_staff') {
    const assigned = await VenueStaffAssignmentModel.exists({
      venueId: booking.venueId,
      userId: actor.sub,
      active: true,
    });
    if (!assigned) throw ApiError.forbidden('You do not have access to this booking');
  }
}

// ---------------------------------------------------------------- holds

function publicReference(): string {
  return `PB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function assertTransactionSupport(): void {
  if (mongoose.connection.readyState !== 1) {
    throw ApiError.internal('Database is not connected');
  }
}

/**
 * Reserves a court interval. The availability window is re-verified inside the
 * transaction and slot rows are written with a unique index, so two concurrent
 * holds for the same slot cannot both succeed.
 */
export async function createBookingHold(input: CreateHoldInput) {
  assertTransactionSupport();

  const venue = await VenueModel.findOne({ _id: input.venueId, status: 'active' })
    .select('timezone')
    .lean();
  if (!venue) throw ApiError.notFound('Venue');

  const localDateKey = localDateParts(input.startAt, venue.timezone).dateKey;
  const availability = await calculateAvailability(
    input.venueId,
    input.pitchId,
    localDateKey,
    input.durationMinutes
  );

  const requested = availability.find(
    interval => interval.startAt.getTime() === input.startAt.getTime()
  );
  if (!requested) throw ApiError.conflict('The requested interval is no longer available');

  const { pitch } = await loadAvailabilityContext(input.venueId, input.pitchId, localDateKey);
  const expiresAt = new Date(Date.now() + config.booking.holdMinutes * 60 * 1000);
  const occupiedStart = new Date(requested.startAt.getTime() - pitch.bufferBeforeMinutes * 60 * 1000);
  const occupiedEnd = new Date(requested.endAt.getTime() + pitch.bufferAfterMinutes * 60 * 1000);
  const slots = slotKeys(occupiedStart, occupiedEnd, pitch.slotIncrementMinutes);

  const session = await mongoose.startSession();
  try {
    let booking: BookingDocument | undefined;

    await session.withTransaction(async () => {
      const existing = await BookingModel.findOne({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
      }).session(session);

      if (existing) {
        if (existing.status === 'held' && existing.holdExpiresAt && existing.holdExpiresAt > new Date()) {
          booking = existing;
          return;
        }
        throw ApiError.conflict('This idempotency key has already been used');
      }

      const now = new Date();
      const conflicting = await BookingModel.findOne({
        pitchId: input.pitchId,
        startAt: { $lt: occupiedEnd },
        endAt: { $gt: occupiedStart },
        ...activeBookingFilter(now),
      }).session(session);

      if (conflicting) throw ApiError.conflict('The requested interval is no longer available');

      await BookingInventoryModel.deleteMany({
        pitchId: input.pitchId,
        slotStartAt: { $in: slots },
        expiresAt: { $lte: now },
      }).session(session);

      const [created] = await BookingModel.create(
        [
          {
            userId: input.userId,
            venueId: input.venueId,
            pitchId: input.pitchId,
            startAt: requested.startAt,
            endAt: requested.endAt,
            timezone: requested.timezone,
            status: 'held',
            paymentStatus: 'pending',
            amountMinor: requested.priceMinor,
            currency: requested.currency,
            holdExpiresAt: expiresAt,
            idempotencyKey: input.idempotencyKey,
            publicReference: publicReference(),
            cancellationPolicy: {
              freeUntilMinutesBefore: 1440,
              refundPercent: 100,
              capturedAt: new Date(),
            },
          },
        ],
        { session }
      );

      await BookingInventoryModel.insertMany(
        slots.map(slotStartAt => ({
          pitchId: input.pitchId,
          bookingId: created._id,
          slotStartAt,
          expiresAt,
        })),
        { session, ordered: true }
      );

      booking = created;
    });

    logger.info({ bookingId: booking?._id, userId: input.userId }, 'Booking hold created');
    return booking;
  } catch (error) {
    throw translateTransactionError(error);
  } finally {
    await session.endSession();
  }
}

/** Confirms a paid hold and converts its inventory rows into a permanent lock. */
export async function confirmBookingHold(userId: string, bookingId: string) {
  const session = await mongoose.startSession();
  try {
    let result: BookingDocument | undefined;

    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({
        _id: bookingId,
        userId,
        status: 'held',
        holdExpiresAt: { $gt: new Date() },
      }).session(session);

      if (!booking) throw ApiError.conflict('The hold is expired or unavailable');

      const paidAttempt = await PaymentAttemptModel.findOne({
        bookingId: booking._id,
        status: 'paid',
        amountMinor: booking.amountMinor,
        currency: booking.currency,
      }).session(session);

      if (!paidAttempt) throw ApiError.conflict('A verified payment matching this booking is required');

      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.holdExpiresAt = undefined;
      await booking.save({ session });

      await BookingInventoryModel.updateMany(
        { bookingId: booking._id },
        { $set: { expiresAt: new Date('9999-12-31T00:00:00.000Z') } }
      ).session(session);

      result = booking;
    });

    logger.info({ bookingId, userId }, 'Booking hold confirmed');
    return result;
  } catch (error) {
    throw translateTransactionError(error);
  } finally {
    await session.endSession();
  }
}

function translateTransactionError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if ((error as { code?: number }).code === 11000) {
    return ApiError.conflict('The requested interval is no longer available');
  }
  if (error instanceof Error && /transaction|replica set|not supported/i.test(error.message)) {
    return ApiError.serviceUnavailable(
      'TRANSACTIONS_REQUIRED',
      'Booking holds require MongoDB transactions; use a replica set or a deployment that supports transactions'
    );
  }
  return error;
}

// ---------------------------------------------------------------- reads

export async function listBookings(query: ListBookingsQuery) {
  const filter: FilterQuery<BookingDocument> = {};
  if (query.userId) filter['userId'] = query.userId;
  if (query.venueId) filter['venueId'] = query.venueId;
  if (query.status) filter['status'] = query.status;
  if (query.from || query.to) {
    filter['startAt'] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lt: query.to } : {}),
    };
  }

  const page = await paginateWithMeta<BookingDocument, Record<string, unknown>>(BookingModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, BOOKING_SORT_WHITELIST, BOOKING_SORT_FALLBACK),
  });

  return withLegacyPagination(page);
}

export async function getBookingForUser(userId: string, bookingId: string) {
  const booking = await BookingModel.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw ApiError.notFound('Booking');
  return booking;
}

export async function getBookingById(bookingId: string) {
  const booking = await BookingModel.findById(bookingId).lean();
  if (!booking) throw ApiError.notFound('Booking');
  return booking;
}

export async function listCourtAvailability(
  venueId: string,
  pitchId: string,
  date: string,
  durationMinutes: number
) {
  return calculateAvailability(venueId, pitchId, date, durationMinutes);
}

// ---------------------------------------------------------------- cancellation

/**
 * Cancels a booking, applying the refund policy snapshot captured at creation
 * time and automatically requesting a refund when the booking was paid.
 */
export async function cancelBooking(input: CancelBookingInput) {
  if (!input.reason.trim()) throw ApiError.badRequest('Cancellation reason is required');

  const isOperator = input.actor.role !== 'customer';
  const booking = await BookingModel.findOne({
    _id: input.bookingId,
    ...(isOperator ? {} : { userId: input.actor.sub }),
  });
  if (!booking) throw ApiError.notFound('Booking');
  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    throw ApiError.conflict('Booking cannot be cancelled in its current state');
  }

  const minutesBeforeStart = (booking.startAt.getTime() - Date.now()) / 60000;
  const refundPercent =
    minutesBeforeStart >= booking.cancellationPolicy.freeUntilMinutesBefore
      ? booking.cancellationPolicy.refundPercent
      : 0;

  booking.status = 'cancelled';
  booking.cancellationReason = input.reason;
  booking.cancelledAt = new Date();
  booking.cancelledBy = new Types.ObjectId(input.actor.sub);
  await booking.save();

  await AuditLogModel.create({
    actorId: input.actor.sub,
    action: isOperator ? 'booking.operator_cancelled' : 'booking.customer_cancelled',
    resourceType: 'Booking',
    resourceId: booking._id,
    metadata: { reason: input.reason, refundPercent },
  });

  await enqueueNotification({
    userId: booking.userId.toString(),
    bookingId: booking._id.toString(),
    type: 'booking_cancelled',
    channel: 'email',
    subject: 'Booking cancelled',
    body: `Your booking was cancelled. Refund eligibility: ${refundPercent}%.`,
    deduplicationKey: `booking-cancelled:${booking._id}`,
  });

  if (refundPercent > 0) {
    const paymentAttempt = await PaymentAttemptModel.findOne({
      bookingId: booking._id,
      status: 'paid',
    }).sort({ createdAt: -1 });

    if (paymentAttempt) {
      await requestRefund({
        bookingId: booking._id.toString(),
        paymentAttemptId: paymentAttempt._id.toString(),
        amountMinor: Math.floor((booking.amountMinor * refundPercent) / 100),
        currency: booking.currency,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
    }
  }

  logger.info({ bookingId: booking._id, refundPercent, actorId: input.actor.sub }, 'Booking cancelled');
  return booking;
}