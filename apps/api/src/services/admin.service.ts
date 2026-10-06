import mongoose, { type FilterQuery, Types } from 'mongoose';

import { logger } from '../config';
import { AuditLogModel } from '../models/admin.model';
import { type BookingDocument,BookingModel } from '../models/bookings.model';
import {
  AvailabilityRuleModel,
  PitchModel,
  PriceRuleModel,
  type VenueDocument,
  VenueModel,
} from '../models/courts.model';
import { NotificationModel } from '../models/notifications.model';
import { PaymentAttemptModel, RefundModel } from '../models/payments.model';
import { ReviewModel } from '../models/reviews.model';
import {
  AuthSessionModel,
  type UserDocument,
  UserModel,
} from '../models/users.model';
import type { UserRole, UserStatus, VenueStatus } from '../types/enums';
import type { SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginateWithMeta } from '../utils/paginate';
import { withLegacyPagination } from '../utils/pagination';
import { containsRegex } from '../utils/query';
import { parseSort, type SortWhitelist } from '../utils/sort';
import { reviewCourt } from './courts.service';
import { processNotificationOutbox } from './notifications.service';

const ADMIN_BOOKING_SORT_WHITELIST: SortWhitelist = {
  startAt: 1,
  createdAt: 1,
  status: 1,
  publicReference: 1,
};

const ADMIN_BOOKING_SORT_FALLBACK: SortSpec = { startAt: -1 };

const VENUE_QUEUE_STATES: VenueStatus[] = ['draft', 'pending_review', 'rejected', 'suspended'];

export interface AdminPageQuery {
  page: number;
  limit: number;
}

export interface AdminBookingQuery extends AdminPageQuery {
  reference?: string;
  status?: string;
  from?: Date;
  to?: Date;
  sort?: string;
}

// ---------------------------------------------------------------- dashboards

export async function venueReviewQueue(query: AdminPageQuery & { status?: VenueStatus }) {
  const filter = query.status ? { status: query.status } : { status: { $in: VENUE_QUEUE_STATES } };

  const page = await paginateWithMeta(VenueModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: { updatedAt: -1 },
    select: 'name status ownerId address.city reviewedAt reviewReason',
  });

  return withLegacyPagination(page);
}

export async function searchUsers(query: AdminPageQuery & { q?: string }) {
  const filter: FilterQuery<UserDocument> = query.q
    ? { $or: [{ email: containsRegex(query.q) }, { displayName: containsRegex(query.q) }] }
    : {};

  const page = await paginateWithMeta(UserModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: { createdAt: -1 },
    select: 'email displayName role status createdAt lastLoginAt',
  });

  return withLegacyPagination(page);
}

export async function searchVenues(query: AdminPageQuery & { q?: string; status?: VenueStatus }) {
  const filter: FilterQuery<VenueDocument> = {};
  if (query.q) filter['name'] = containsRegex(query.q);
  if (query.status) filter['status'] = query.status;

  const page = await paginateWithMeta(VenueModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
    select: 'name status address.city timezone ownerId reviewedAt',
  });

  return withLegacyPagination(page);
}

export async function searchBookings(query: AdminBookingQuery) {
  const filter: FilterQuery<BookingDocument> = {};
  if (query.reference) filter['publicReference'] = query.reference.toUpperCase();
  if (query.status) filter['status'] = query.status;
  if (query.from || query.to) {
    filter['startAt'] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lt: query.to } : {}),
    };
  }

  const page = await paginateWithMeta(BookingModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, ADMIN_BOOKING_SORT_WHITELIST, ADMIN_BOOKING_SORT_FALLBACK),
    select:
      'publicReference venueId pitchId startAt endAt status paymentStatus amountMinor currency cancellationReason userId',
  });

  return withLegacyPagination(page);
}

export async function bookingPaymentView(bookingId: string) {
  const [payments, refunds, audit] = await Promise.all([
    PaymentAttemptModel.find({ bookingId })
      .select(
        'provider providerPaymentId status amountMinor currency failureCode uncertainReason attemptedAt createdAt'
      )
      .sort({ createdAt: -1 })
      .lean(),
    RefundModel.find({ bookingId })
      .select('status amountMinor currency reason failureReason providerRefundId createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean(),
    AuditLogModel.find({ resourceType: 'Booking', resourceId: bookingId })
      .select('action actorId requestId metadata createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return { payments, refunds, audit };
}

export async function venueAction(input: {
  venueId: string;
  actorId: string;
  requestId?: string;
  status: 'active' | 'rejected' | 'suspended';
  reason: string;
}) {
  if (!input.reason.trim()) throw ApiError.badRequest('Administrative reason is required');
  return reviewCourt(input);
}

// ---------------------------------------------------------------- reporting

export async function operationalReport(input: { from: Date; to: Date }) {
  const range = { startAt: { $gte: input.from, $lt: input.to } };

  const [bookingCounts, cancellationCount, gross, refunds, utilization, reviewTotals] =
    await Promise.all([
      BookingModel.aggregate([{ $match: range }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      BookingModel.countDocuments({ ...range, status: 'cancelled' }),
      BookingModel.aggregate([
        { $match: { ...range, status: { $in: ['confirmed', 'completed'] } } },
        {
          $group: {
            _id: '$currency',
            amountMinor: { $sum: '$amountMinor' },
            bookings: { $sum: 1 },
          },
        },
      ]),
      RefundModel.aggregate([
        { $match: { createdAt: { $gte: input.from, $lt: input.to }, status: 'succeeded' } },
        { $group: { _id: '$currency', amountMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
      ]),
      BookingModel.aggregate([
        { $match: { ...range, status: { $in: ['confirmed', 'completed'] } } },
        {
          $group: {
            _id: '$venueId',
            bookedMinutes: { $sum: { $divide: [{ $subtract: ['$endAt', '$startAt'] }, 60000] } },
            bookings: { $sum: 1 },
          },
        },
      ]),
      ReviewModel.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$venueId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
  ]);

  return {
    definitions: {
      bookingCounts: 'Bookings grouped by booking status whose startAt falls in [from,to).',
      utilization:
        'Booked minutes grouped by venue; the denominator requires configured operating minutes and is not inferred here.',
      cancellations: 'Bookings with status cancelled whose startAt falls in [from,to).',
      grossBookingValue: 'Sum of amountMinor for confirmed or completed bookings grouped by currency.',
      refunds: 'Succeeded refund amountMinor grouped by currency.',
      reviewAverages: 'Average published review rating grouped by venue.',
    },
    bookingCounts,
    utilization,
    cancellations: cancellationCount,
    grossBookingValue: gross,
    refunds,
    reviewAverages: reviewTotals,
  };
}

export async function exportBookings(input: { from: Date; to: Date }) {
  return BookingModel.find({ startAt: { $gte: input.from, $lt: input.to } })
    .select('publicReference venueId pitchId startAt endAt status paymentStatus amountMinor currency')
    .lean();
}

// ---------------------------------------------------------------- platform ops

export async function databaseHealth() {
  const isConnected = mongoose.connection.readyState === 1;
  let pingMs = -1;

  if (isConnected && mongoose.connection.db) {
    const start = Date.now();
    try {
      await mongoose.connection.db.admin().ping();
      pingMs = Date.now() - start;
    } catch {
      pingMs = -1;
    }
  }

  const [
    users,
    venues,
    pitches,
    bookings,
    authSessions,
    availabilityRules,
    priceRules,
    paymentAttempts,
    refunds,
    auditLogs,
    reviews,
    notifications,
  ] = await Promise.all([
    UserModel.countDocuments(),
    VenueModel.countDocuments(),
    PitchModel.countDocuments(),
    BookingModel.countDocuments(),
    AuthSessionModel.countDocuments(),
    AvailabilityRuleModel.countDocuments(),
    PriceRuleModel.countDocuments(),
    PaymentAttemptModel.countDocuments(),
    RefundModel.countDocuments(),
    AuditLogModel.countDocuments(),
    ReviewModel.countDocuments(),
    NotificationModel.countDocuments(),
  ]);

  return {
    status: isConnected ? ('connected' as const) : ('disconnected' as const),
    databaseName: mongoose.connection.name || 'pickleball_booking',
    host: mongoose.connection.host || 'MongoDB Atlas',
    pingMs,
    readyState: mongoose.connection.readyState,
    counts: {
      users,
      venues,
      pitches,
      bookings,
      authSessions,
      availabilityRules,
      priceRules,
      paymentAttempts,
      refunds,
      auditLogs,
      reviews,
      notifications,
    },
    checkedAt: new Date(),
  };
}

export interface AdminVenueInput {
  name: string;
  description?: string;
  city: string;
  line1?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  courtName?: string;
  courtSurface?: string;
  indoor?: boolean;
  pricePerHour?: number;
}

const DEFAULT_IMAGE_URL =
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop';

/**
 * Creates a fully operational venue (venue + court + opening hours + pricing) in
 * one administrator action so the seeded court is immediately bookable.
 */
export async function createVenueWithCourt(actorId: string, input: AdminVenueInput, requestId?: string) {
  const ownerId = new Types.ObjectId(actorId);
  const currency = (input.currency || 'INR').toUpperCase();
  const timezone = input.timezone || 'Asia/Kolkata';

  const venue = await VenueModel.create({
    ownerId,
    name: input.name,
    description:
      input.description ||
      'State-of-the-art pickleball facility with official tournament court dimensions and LED night lighting.',
    timezone,
    currency,
    address: {
      line1: input.line1 || 'Sports Arena Hub, Courtway',
      city: input.city,
      region: input.region || 'Central',
      postalCode: input.postalCode || '110001',
      country: (input.country || 'IN').toUpperCase(),
    },
    status: 'active',
    reviewedAt: new Date(),
    reviewedBy: ownerId,
    reviewReason: 'Created and automatically published by administrator',
    images: [
      {
        key: `venues/default-${Date.now()}.jpg`,
        url: DEFAULT_IMAGE_URL,
        mimeType: 'image/jpeg',
        sizeBytes: 154200,
        width: 1200,
        height: 800,
        altText: input.name,
      },
    ],
  });

  const pitch = await PitchModel.create({
    venueId: venue._id,
    name: input.courtName || 'Court 1',
    surface: input.courtSurface || 'Pro Cushion Acrylic',
    indoor: Boolean(input.indoor),
    isActive: true,
    sortOrder: 0,
    slotIncrementMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  });

  const availabilityRules = await AvailabilityRuleModel.create(
    [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      venueId: venue._id,
      dayOfWeek,
      startMinute: 360,
      endMinute: 1320,
      isActive: true,
    }))
  );

  const priceRule = await PriceRuleModel.create({
    venueId: venue._id,
    pricingUnit: 'hour',
    amountMinor: Math.round((input.pricePerHour ?? 500) * 100),
    currency,
    priority: 1,
    isActive: true,
  });

  await AuditLogModel.create({
    action: 'venue.create',
    actorId: ownerId,
    resourceType: 'Venue',
    resourceId: venue._id,
    requestId: requestId ?? 'admin-panel',
    metadata: { name: venue.name, city: venue.address.city },
  });

  return {
    venue,
    pitch,
    availabilityRulesCount: availabilityRules.length,
    priceRule,
  };
}

const SEED_VENUES: Array<{
  name: string;
  description: string;
  address: { line1: string; city: string; region: string; postalCode: string; country: string };
  courts: Array<{ name: string; surface: string; indoor: boolean }>;
  pricePerHour: number;
}> = [
  {
    name: 'Apex Pickleball Arena',
    description:
      'Premier multi-court pickleball facility with regulation markings, outdoor & indoor courts, and spectator seating.',
    address: {
      line1: 'Bandra Reclamation Sports Zone',
      city: 'Mumbai',
      region: 'Maharashtra',
      postalCode: '400050',
      country: 'IN',
    },
    courts: [
      { name: 'Center Court (Pro)', surface: 'Pro Acrylic Cushioned', indoor: false },
      { name: 'Court 2 (Indoor)', surface: 'Polyurethane Indoor', indoor: true },
    ],
    pricePerHour: 600,
  },
  {
    name: 'Grand Slam Pickleball Club',
    description:
      'Modern pickleball club offering floodlit night courts, coaching sessions, paddle rentals, and locker rooms.',
    address: {
      line1: 'Indiranagar 100ft Road',
      city: 'Bengaluru',
      region: 'Karnataka',
      postalCode: '560038',
      country: 'IN',
    },
    courts: [
      { name: 'Court A - Outdoor', surface: 'Hard Court', indoor: false },
      { name: 'Court B - Indoor AC', surface: 'Cushioned Acrylic', indoor: true },
    ],
    pricePerHour: 500,
  },
];

/** Idempotent demo dataset: venues that already exist by name are skipped. */
export async function seedDemoData(actorId: string) {
  const ownerId = new Types.ObjectId(actorId);
  const createdVenues: Array<{ _id: Types.ObjectId; name: string; address: { city: string } }> = [];

  for (const item of SEED_VENUES) {
    if (await VenueModel.exists({ name: item.name })) continue;

    const venue = await VenueModel.create({
      ownerId,
      name: item.name,
      description: item.description,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      address: item.address,
      status: 'active',
      reviewedAt: new Date(),
      reviewedBy: ownerId,
      reviewReason: 'Platform seeded venue',
      images: [
        {
          key: `venues/seed-${Date.now()}.jpg`,
          url: DEFAULT_IMAGE_URL,
          mimeType: 'image/jpeg',
          sizeBytes: 160000,
          width: 1200,
          height: 800,
          altText: item.name,
        },
      ],
    });

    await PitchModel.create(
      item.courts.map((court, index) => ({
        venueId: venue._id,
        name: court.name,
        surface: court.surface,
        indoor: court.indoor,
        isActive: true,
        sortOrder: index,
        slotIncrementMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      }))
    );

    await AvailabilityRuleModel.create(
      [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
        venueId: venue._id,
        dayOfWeek,
        startMinute: 360,
        endMinute: 1320,
        isActive: true,
      }))
    );

    await PriceRuleModel.create({
      venueId: venue._id,
      pricingUnit: 'hour',
      amountMinor: item.pricePerHour * 100,
      currency: 'INR',
      priority: 1,
      isActive: true,
    });

    createdVenues.push(venue);
  }

  logger.info({ seeded: createdVenues.length }, 'Demo venue data seeded');
  return {
    seededCount: createdVenues.length,
    venues: createdVenues.map(venue => ({
      id: venue._id,
      name: venue.name,
      city: venue.address.city,
    })),
  };
}

export async function updateUserRoleOrStatus(input: {
  userId: string;
  actorId: string;
  role?: UserRole;
  status?: UserStatus;
}) {
  const user = await UserModel.findById(input.userId);
  if (!user) throw ApiError.notFound('User not found');

  if (input.role) user.role = input.role;
  if (input.status) user.status = input.status;
  await user.save();

  await AuditLogModel.create({
    action: 'admin.user.update',
    actorId: new Types.ObjectId(input.actorId),
    resourceType: 'User',
    resourceId: user._id,
    metadata: { role: input.role, status: input.status },
  });

  if (input.status === 'suspended' || input.status === 'deleted') {
    await AuthSessionModel.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
  }

  logger.info({ userId: user._id, role: user.role, status: user.status }, 'User updated by admin');
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };
}

export async function processNotificationsBatch() {
  return processNotificationOutbox();
}
