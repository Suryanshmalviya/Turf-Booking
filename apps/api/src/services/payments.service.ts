import mongoose from 'mongoose';

import { config, logger } from '../config';
import { BookingModel } from '../models/bookings.model';
import {
  PaymentAttemptModel,
  PaymentWebhookEventModel,
  RefundModel,
} from '../models/payments.model';
import type { PaymentStatus } from '../types/enums';
import { ApiError } from '../utils/api-error';
import { enqueueNotification } from './notifications.service';
import {
  getPaymentProvider,
  type PaymentProviderAdapter,
  type VerifiedPaymentEvent,
} from './paymentProvider.service';

export interface CreateAttemptInput {
  userId: string;
  bookingId: string;
  idempotencyKey: string;
}

export interface RefundInput {
  bookingId: string;
  paymentAttemptId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
  requestId?: string;
}

/**
 * Starts a payment for a held booking. Idempotent on
 * `(bookingId, idempotencyKey)` so retried requests never double-charge.
 */
export async function createPaymentAttempt(
  input: CreateAttemptInput,
  provider: PaymentProviderAdapter = getPaymentProvider()
) {
  const booking = await BookingModel.findOne({
    _id: input.bookingId,
    userId: input.userId,
    status: 'held',
    holdExpiresAt: { $gt: new Date() },
  })
    .select('amountMinor currency')
    .lean();

  if (!booking) throw ApiError.conflict('The booking hold is expired or unavailable');

  const existing = await PaymentAttemptModel.findOne({
    bookingId: input.bookingId,
    idempotencyKey: input.idempotencyKey,
  }).lean();

  if (existing) {
    return {
      attempt: existing,
      developmentOnly: existing.provider === 'development_mock',
    };
  }

  const created = await provider.createPayment({
    amountMinor: booking.amountMinor,
    currency: booking.currency,
    bookingId: booking._id.toString(),
    idempotencyKey: input.idempotencyKey,
  });

  try {
    const attempt = await PaymentAttemptModel.create({
      bookingId: booking._id,
      provider: created.provider,
      providerPaymentId: created.providerPaymentId,
      idempotencyKey: input.idempotencyKey,
      status: 'pending',
      amountMinor: booking.amountMinor,
      currency: booking.currency,
    });
    return { attempt, developmentOnly: created.developmentOnly };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const attempt = await PaymentAttemptModel.findOne({
        bookingId: input.bookingId,
        idempotencyKey: input.idempotencyKey,
      });
      if (attempt) return { attempt, developmentOnly: created.developmentOnly };
    }
    throw error;
  }
}

export function statusForEvent(eventType: VerifiedPaymentEvent['eventType']): PaymentStatus {
  if (eventType === 'payment.succeeded') return 'paid';
  if (eventType === 'payment.failed') return 'failed';
  return 'uncertain';
}

/** Provider events are only trusted when they match the stored booking snapshot. */
export function paymentMatchesSnapshot(
  attempt: { amountMinor: number; currency: string },
  event: { amountMinor: number; currency: string }
): boolean {
  return (
    attempt.amountMinor === event.amountMinor && attempt.currency === event.currency.toUpperCase()
  );
}

export async function assertPaidAttempt(
  bookingId: string,
  amountMinor: number,
  currency: string
): Promise<void> {
  const attempt = await PaymentAttemptModel.findOne({
    bookingId,
    status: 'paid',
    amountMinor,
    currency,
  }).sort({ createdAt: -1 });

  if (!attempt) throw ApiError.conflict('A verified payment matching this booking is required');
}

/**
 * Applies a verified provider event exactly once. Webhook ids are recorded with
 * a unique index so replays are acknowledged without a second state change.
 */
export async function processPaymentWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  provider: PaymentProviderAdapter = getPaymentProvider()
): Promise<{ duplicate: boolean }> {
  const event = provider.verifyWebhook(rawBody, signature);

  let eventRecord;
  try {
    eventRecord = await PaymentWebhookEventModel.create({
      provider: provider.name,
      eventId: event.eventId,
      eventType: event.eventType,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;

    const existing = await PaymentWebhookEventModel.findOne({
      provider: provider.name,
      eventId: event.eventId,
    });
    if (existing?.processedAt) return { duplicate: true };
    if (!existing) throw error;

    eventRecord = existing;
    eventRecord.processingError = undefined;
    await eventRecord.save();
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (event.eventType.startsWith('refund.')) {
        await applyRefundEvent(event, session);
      } else {
        await applyPaymentEvent(event, provider.name, session);
      }
      eventRecord.processedAt = new Date();
      await eventRecord.save({ session });
    });

    return { duplicate: false };
  } catch (error) {
    await PaymentWebhookEventModel.updateOne(
      { _id: eventRecord._id },
      {
        $set: {
          processingError: error instanceof Error ? error.message : 'Webhook processing failed',
        },
      }
    );
    throw error;
  } finally {
    await session.endSession();
  }
}

async function applyRefundEvent(
  event: VerifiedPaymentEvent,
  session: mongoose.ClientSession
): Promise<void> {
  const refund = await RefundModel.findOne({
    providerRefundId: event.providerPaymentId,
    bookingId: event.bookingId,
  }).session(session);
  if (!refund) throw ApiError.notFound('Refund');

  refund.status = event.eventType === 'refund.succeeded' ? 'succeeded' : 'failed';
  refund.failureReason = event.failureCode;
  await refund.save({ session });
}

async function applyPaymentEvent(
  event: VerifiedPaymentEvent,
  providerName: string,
  session: mongoose.ClientSession
): Promise<void> {
  const attempt = await PaymentAttemptModel.findOne({
    provider: providerName,
    providerPaymentId: event.providerPaymentId,
    bookingId: event.bookingId,
  }).session(session);
  if (!attempt) throw ApiError.notFound('Payment attempt');

  if (!paymentMatchesSnapshot(attempt, event)) {
    attempt.status = 'uncertain';
    attempt.uncertainReason =
      'Provider event amount or currency does not match the trusted booking snapshot';
    await attempt.save({ session });
    throw ApiError.conflict('Payment amount or currency mismatch');
  }

  attempt.status = statusForEvent(event.eventType);
  attempt.failureCode = event.failureCode;
  attempt.uncertainReason = event.uncertainReason;
  await attempt.save({ session });

  const booking = await BookingModel.findOne({
    _id: event.bookingId,
    status: 'held',
    holdExpiresAt: { $gt: new Date() },
    amountMinor: attempt.amountMinor,
    currency: attempt.currency,
  }).session(session);

  if (!booking) return;

  if (attempt.status === 'paid') {
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.holdExpiresAt = undefined;
  } else {
    booking.paymentStatus = attempt.status;
  }
  await booking.save({ session });

  await enqueueNotification({
    userId: booking.userId.toString(),
    bookingId: booking._id.toString(),
    type: attempt.status === 'paid' ? 'booking_confirmed' : 'payment_failed',
    channel: 'email',
    subject: attempt.status === 'paid' ? 'Booking confirmed' : 'Payment problem',
    body:
      attempt.status === 'paid'
        ? 'Your payment succeeded and your booking is confirmed.'
        : `Payment status: ${attempt.status}.`,
    deduplicationKey: `payment-${attempt.status}:${attempt._id}`,
  });
}

/**
 * Flags long-pending attempts as uncertain so reconciliation never leaves a
 * booking silently stuck, and mirrors that uncertainty onto the booking.
 */
export async function reconcilePendingPayments(): Promise<{ markedUncertain: number }> {
  const cutoff = new Date(Date.now() - config.payments.pendingTimeoutMinutes * 60 * 1000);
  const result = await PaymentAttemptModel.updateMany(
    { status: 'pending', updatedAt: { $lt: cutoff } },
    {
      $set: {
        status: 'uncertain',
        uncertainReason: 'No terminal provider result received before reconciliation timeout',
      },
    }
  );

  if (result.modifiedCount > 0) {
    const bookingIds = await PaymentAttemptModel.find({
      status: 'uncertain',
      updatedAt: { $gte: cutoff },
    }).distinct('bookingId');
    if (bookingIds.length > 0) {
      await BookingModel.updateMany(
        { paymentStatus: 'pending', _id: { $in: bookingIds } },
        { $set: { paymentStatus: 'uncertain' } }
      );
    }
    logger.warn({ markedUncertain: result.modifiedCount }, 'Reconciled stale payment attempts');
  }

  return { markedUncertain: result.modifiedCount };
}

/**
 * Creates a refund against a verified capture. Re-running with the same
 * idempotency key returns the existing refund rather than issuing a second one.
 */
export async function requestRefund(
  input: RefundInput,
  provider: PaymentProviderAdapter = getPaymentProvider()
) {
  const existing = await RefundModel.findOne({
    bookingId: input.bookingId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) return existing;

  const attempt = await PaymentAttemptModel.findOne({
    _id: input.paymentAttemptId,
    bookingId: input.bookingId,
    status: 'paid',
  });
  if (!attempt || attempt.amountMinor < input.amountMinor || attempt.currency !== input.currency) {
    throw ApiError.conflict('Refund does not match a verified payment');
  }

  const refund = await RefundModel.create({
    bookingId: input.bookingId,
    paymentAttemptId: attempt._id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    status: 'requested',
  });

  try {
    const result = await provider.createRefund({
      providerPaymentId: attempt.providerPaymentId ?? '',
      amountMinor: input.amountMinor,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
    });
    refund.providerRefundId = result.providerRefundId;
    refund.status = 'processing';
    await refund.save();
  } catch (error) {
    refund.status = 'failed';
    refund.failureReason = error instanceof Error ? error.message : 'Refund provider failed';
    await refund.save();
    throw error;
  }

  const booking = await BookingModel.findById(input.bookingId).select('userId');
  if (booking) {
    await enqueueNotification({
      userId: booking.userId.toString(),
      bookingId: input.bookingId,
      type: 'refund_updated',
      channel: 'email',
      subject: 'Refund requested',
      body: 'Your refund is being processed.',
      deduplicationKey: `refund-requested:${refund._id}`,
    });
  }

  return refund;
}
