/**
 * Types for the administrative console.
 *
 * Every list shape here mirrors what `apps/api/src/services/admin.service.ts`
 * actually returns (including its Mongo projections), so a column can be typed
 * instead of cast. Where the API aggregates with `$group`, the `_id` becomes a
 * named field.
 */

import type { BookingStatus, PaymentStatus } from './booking';
import type { BadgeTone } from './ui';

/** Moderation transitions accepted by `POST /admin/venues/:venueId/:action`. */
export const VENUE_ACTIONS = ['active', 'rejected', 'suspended'] as const;

export type VenueAction = (typeof VENUE_ACTIONS)[number];

/** Mirrors `USER_STATUSES` in `apps/api/src/types/enums.ts`. */
export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;

export type AdminUserStatus = (typeof USER_STATUSES)[number];

/** Mirrors `USER_ROLES` in `apps/api/src/types/enums.ts`. */
export const USER_ROLES = ['customer', 'venue_owner', 'venue_staff', 'admin'] as const;

export type AdminUserRole = (typeof USER_ROLES)[number];

/** Mirrors `VENUE_STATUSES` in `apps/api/src/types/enums.ts`. */
export const VENUE_STATUSES = ['draft', 'pending_review', 'active', 'rejected', 'suspended'] as const;

export type AdminVenueStatus = (typeof VENUE_STATUSES)[number];

/** Mirrors `REVIEW_STATUSES` in `apps/api/src/types/enums.ts`. */
export const REVIEW_STATUSES = ['pending', 'published', 'rejected'] as const;

export type AdminReviewStatus = (typeof REVIEW_STATUSES)[number];

// ---------------------------------------------------------------- pagination

export const ADMIN_PAGE_SIZE = 25;

/** Page envelope shared by every `/admin` list endpoint. */
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Pagination plus free-text search, shared by the users and courts lists. */
export interface AdminListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  sort?: string;
}

// ---------------------------------------------------------------- records

/**
 * User row from `GET /admin/users`.
 *
 * `select` in `searchUsers` omits `_id`, so the stable key is the email.
 */
export interface AdminUser {
  _id?: string;
  email: string;
  displayName: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  createdAt?: string;
  lastLoginAt?: string;
}

/**
 * Court row from `GET /admin/venues`.
 *
 * `select` in `searchVenues` omits `_id`, so the stable key is the name.
 */
export interface AdminVenue {
  _id?: string;
  name: string;
  status: AdminVenueStatus;
  address?: { city?: string };
  timezone?: string;
  ownerId?: string;
  reviewedAt?: string;
  /** Present only on the review queue projection. */
  reviewReason?: string;
}

/** Booking row from `GET /admin/bookings`. */
export interface AdminBooking {
  _id?: string;
  /** Short reference shown to the customer; also the search key. */
  publicReference: string;
  venueId: string;
  pitchId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amountMinor: number;
  currency: string;
  userId?: string;
  cancellationReason?: string;
}

/** Payment attempt from `GET /admin/bookings/:bookingId/payments`. */
export interface AdminPaymentAttempt {
  _id?: string;
  provider?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  failureCode?: string;
  uncertainReason?: string;
  attemptedAt?: string;
  createdAt?: string;
}

/** Refund from `GET /admin/bookings/:bookingId/payments`. */
export interface AdminRefund {
  _id?: string;
  status: string;
  amountMinor: number;
  currency: string;
  reason?: string;
  failureReason?: string;
  providerRefundId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Audit entry from `GET /admin/bookings/:bookingId/payments`. */
export interface AdminAuditEntry {
  _id?: string;
  action: string;
  actorId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AdminBookingPayments {
  payments: AdminPaymentAttempt[];
  refunds: AdminRefund[];
  audit: AdminAuditEntry[];
}

// ---------------------------------------------------------------- reports

/** One bucket of `bookingCounts`, keyed by booking status. */
export interface BookingCountBucket {
  _id: BookingStatus;
  count: number;
}

/** One bucket of `utilization`, keyed by venue. */
export interface UtilizationBucket {
  _id: string;
  bookedMinutes: number;
  bookings: number;
}

/** One bucket of `grossBookingValue` / `refunds`, keyed by currency. */
export interface MoneyBucket {
  _id: string;
  amountMinor: number;
  bookings?: number;
  count?: number;
}

/** One bucket of `reviewAverages`, keyed by venue. */
export interface ReviewAverageBucket {
  _id: string;
  average: number;
  count: number;
}

/**
 * `GET /admin/reports`.
 *
 * `definitions` is not decoration: the utilisation denominator is deliberately
 * *not* computed server-side, so the UI must present booked minutes rather than
 * invent a percentage.
 */
export interface AdminReport {
  definitions: Record<string, string>;
  bookingCounts: BookingCountBucket[];
  utilization: UtilizationBucket[];
  cancellations: number;
  grossBookingValue: MoneyBucket[];
  refunds: MoneyBucket[];
  reviewAverages: ReviewAverageBucket[];
}

/** `GET /admin/database`. */
export interface DatabaseCounts {
  users: number;
  venues: number;
  pitches: number;
  bookings: number;
  authSessions: number;
  availabilityRules: number;
  priceRules: number;
  paymentAttempts: number;
  refunds: number;
  auditLogs: number;
  reviews: number;
  notifications: number;
}

export interface DatabaseStatus {
  status: 'connected' | 'disconnected';
  databaseName: string;
  host: string;
  /** Round-trip time in ms; `-1` when the ping could not be issued. */
  pingMs: number;
  readyState: number;
  counts: DatabaseCounts;
  checkedAt: string;
}

export interface SeedResult {
  seededCount: number;
  venues: Array<{ id: string; name: string; city: string }>;
}

export interface AdminUserUpdate {
  role?: AdminUserRole;
  status?: AdminUserStatus;
}

export interface AdminUserResult {
  id: string;
  email: string;
  displayName: string;
  role: AdminUserRole;
  status: AdminUserStatus;
}

export interface ProcessNotificationsResult {
  processed?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------- presentation

export const USER_STATUS_TONE: Record<AdminUserStatus, BadgeTone> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

export const VENUE_STATUS_TONE: Record<AdminVenueStatus, BadgeTone> = {
  draft: 'neutral',
  pending_review: 'warning',
  active: 'success',
  rejected: 'danger',
  suspended: 'warning',
};

export const REVIEW_STATUS_TONE: Record<AdminReviewStatus, BadgeTone> = {
  pending: 'warning',
  published: 'success',
  rejected: 'danger',
};

export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, character => character.toUpperCase());
}