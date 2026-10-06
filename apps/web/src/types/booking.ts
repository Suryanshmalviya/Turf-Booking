/** Domain types for the booking lifecycle: availability, holds and payments. */

import type { BadgeTone } from './ui';

export interface AvailabilityInterval {
  startAt: string;
  endAt: string;
  /** Pre-formatted local time range, e.g. `"24/09/2026, 15:30"`. */
  startLocal: string;
  endLocal: string;
  timezone: string;
  priceMinor: number;
  currency: string;
}

/** Mirrors `BOOKING_STATUSES` in `apps/api/src/types/enums.ts`. */
export const BOOKING_STATUSES = [
  'held',
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Mirrors `PAYMENT_STATUSES` in `apps/api/src/types/enums.ts`. */
export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'paid',
  'failed',
  'uncertain',
  'refunded',
  'partially_refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses that still occupy inventory and can be changed by the customer. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['held', 'pending', 'confirmed'];

/** Policy snapshot captured when the hold was created. */
export interface CancellationPolicy {
  freeUntilMinutesBefore: number;
  refundPercent: number;
  capturedAt: string;
}

export interface Booking {
  _id: string;
  userId: string;
  venueId: string;
  pitchId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amountMinor: number;
  currency: string;
  /** Short human-facing reference shown instead of the Mongo id. */
  publicReference: string;
  holdExpiresAt?: string;
  cancellationPolicy?: CancellationPolicy;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateHoldInput {
  venueId: string;
  pitchId: string;
  startAt: string;
  durationMinutes: number;
}

export interface PaymentAttempt {
  _id?: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  provider?: string;
}

export interface PaymentAttemptResult {
  attempt: PaymentAttempt;
  /** `true` when the server is running the no-provider payment mock. */
  developmentOnly: boolean;
}

/** Where the customer is in the pay step, derived from hold + payment state. */
export type PaymentState = 'idle' | 'creating_hold' | 'awaiting_payment' | 'paid' | 'confirmed' | 'failed';

/** Filters accepted by `GET /bookings`. */
export interface BookingListQuery {
  status?: BookingStatus;
  /** ISO date; bookings starting on or after this instant. */
  from?: string;
  /** ISO date; bookings starting before this instant. */
  to?: string;
  venueId?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

/**
 * Slot the customer picked on the availability grid. Kept outside the router so
 * a refresh mid-flow can recover the selection.
 */
export interface BookingDraft {
  venueId: string;
  venueName?: string;
  pitchId: string;
  pitchName?: string;
  /** `YYYY-MM-DD` local date the slot belongs to. */
  date: string;
  durationMinutes: number;
  interval: AvailabilityInterval;
}

export interface AvailabilityQuery {
  venueId: string;
  pitchId: string;
  date: string;
  durationMinutes: number;
}

export const BOOKING_STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  held: 'info',
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
  completed: 'neutral',
  no_show: 'danger',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: 'warning',
  authorized: 'info',
  paid: 'success',
  failed: 'danger',
  uncertain: 'warning',
  refunded: 'neutral',
  partially_refunded: 'neutral',
};

/** `true` when the customer may still cancel or reschedule the booking. */
export function isMutable(booking: Pick<Booking, 'status' | 'startAt'>): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(booking.status) && new Date(booking.startAt).getTime() > Date.now();
}

/** `true` when a hold is present but past its deadline. */
export function isHoldExpired(booking: Pick<Booking, 'status' | 'holdExpiresAt'>): boolean {
  if (booking.status !== 'held') return false;
  return !booking.holdExpiresAt || new Date(booking.holdExpiresAt).getTime() <= Date.now();
}

/**
 * `true` when the server will not change this booking's status on its own, so
 * polling for an update can stop. A live hold is deliberately excluded: its
 * status only changes when the payment provider reports back.
 */
export function isSettled(booking: Pick<Booking, 'status' | 'holdExpiresAt'>): boolean {
  if (booking.status === 'held') return isHoldExpired(booking);
  return !ACTIVE_BOOKING_STATUSES.includes(booking.status);
}

/** Human label for a booking status. */
export function bookingStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, character => character.toUpperCase());
}

/** Human label for a payment status. */
export function paymentStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, character => character.toUpperCase());
}