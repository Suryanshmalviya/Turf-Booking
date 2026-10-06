import type { Types } from 'mongoose';

import { BookingInventoryModel, BookingModel } from '../models/bookings.model';
import {
  type AvailabilityExceptionDocument,
  AvailabilityExceptionModel,
  AvailabilityRuleModel,
  PitchModel,
  type PriceRuleDocument,
  PriceRuleModel,
  VenueModel,
} from '../models/courts.model';
import { ApiError } from '../utils/api-error';
import {
  formatLocalTime,
  localDateParts,
  nextDateKey,
  parseDateKey,
  zonedDateTimeToUtc,
} from '../utils/timezone';

export const ACTIVE_BOOKING_STATUSES = ['held', 'pending', 'confirmed'] as const;

export interface AvailabilityInterval {
  startAt: Date;
  endAt: Date;
  startLocal: string;
  endLocal: string;
  timezone: string;
  priceMinor: number;
  currency: string;
}

export interface AvailabilityContext {
  venue: { _id: Types.ObjectId; timezone: string; currency: string };
  pitch: {
    _id: Types.ObjectId;
    slotIncrementMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  };
  rules: Array<{ startMinute: number; endMinute: number }>;
  exceptions: Array<Pick<AvailabilityExceptionDocument, 'kind' | 'startMinute' | 'endMinute'>>;
  prices: PriceRuleCandidate[];
}

export type PriceRuleCandidate = Pick<
  PriceRuleDocument,
  | 'dayOfWeek'
  | 'startMinute'
  | 'endMinute'
  | 'startDate'
  | 'endDate'
  | 'minDurationMinutes'
  | 'maxDurationMinutes'
  | 'priority'
  | 'isActive'
  | 'amountMinor'
  | 'currency'
  | 'pricingUnit'
>;

/** Start-inclusive, end-exclusive interval containment. */
export function intervalsOverlap(
  existingStart: Date,
  existingEnd: Date,
  requestedStart: Date,
  requestedEnd: Date
): boolean {
  return existingStart < requestedEnd && existingEnd > requestedStart;
}

export function isHoldActive(
  status: string,
  holdExpiresAt: Date | undefined,
  now = new Date()
): boolean {
  return status === 'held' && holdExpiresAt !== undefined && holdExpiresAt > now;
}

/** Bookings that still occupy inventory: confirmed/pending always, holds until TTL. */
export function activeBookingFilter(now: Date): Record<string, unknown> {
  return {
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    $or: [{ status: { $in: ['confirmed', 'pending'] } }, { holdExpiresAt: { $gt: now } }],
  };
}

/** All slot boundaries touched by an interval, used for hold inventory rows. */
export function slotKeys(startAt: Date, endAt: Date, incrementMinutes: number): Date[] {
  const incrementMs = incrementMinutes * 60 * 1000;
  const first = Math.floor(startAt.getTime() / incrementMs) * incrementMs;
  const last = Math.ceil(endAt.getTime() / incrementMs) * incrementMs;
  const slots: Date[] = [];
  for (let time = first; time < last; time += incrementMs) slots.push(new Date(time));
  return slots;
}

/**
 * Picks the highest-priority active price rule matching the local weekday,
 * local minute-of-day, calendar window and requested duration.
 */
export function selectPriceRule(
  rules: PriceRuleCandidate[],
  startAt: Date,
  endAt: Date,
  timezone: string
): PriceRuleCandidate | undefined {
  const start = localDateParts(startAt, timezone);
  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

  return rules
    .filter(rule => rule.isActive)
    .filter(rule => rule.dayOfWeek === undefined || rule.dayOfWeek === start.weekday)
    .filter(
      rule =>
        rule.startMinute === undefined ||
        (start.minute >= rule.startMinute && start.minute < (rule.endMinute ?? 1440))
    )
    .filter(rule => rule.startDate === undefined || startAt >= rule.startDate)
    .filter(rule => rule.endDate === undefined || startAt <= rule.endDate)
    .filter(
      rule => rule.minDurationMinutes === undefined || durationMinutes >= rule.minDurationMinutes
    )
    .filter(
      rule => rule.maxDurationMinutes === undefined || durationMinutes <= rule.maxDurationMinutes
    )
    .sort((left, right) => right.priority - left.priority)[0];
}

/** Resolves the venue, court, operating windows, exceptions and prices for a date. */
export async function loadAvailabilityContext(
  venueId: string,
  pitchId: string,
  dateKey: string
): Promise<AvailabilityContext> {
  try {
    parseDateKey(dateKey);
  } catch {
    throw ApiError.badRequest('date must use YYYY-MM-DD');
  }

  const [venue, pitch] = await Promise.all([
    VenueModel.findOne({ _id: venueId, status: 'active' }).lean(),
    PitchModel.findOne({ _id: pitchId, venueId, isActive: true }).lean(),
  ]);
  if (!venue) throw ApiError.notFound('Venue');
  if (!pitch) throw ApiError.notFound('Court');

  const weekday = localDateParts(
    zonedDateTimeToUtc(dateKey, 720, venue.timezone),
    venue.timezone
  ).weekday;
  const dayStart = zonedDateTimeToUtc(dateKey, 0, venue.timezone);
  const dayEnd = zonedDateTimeToUtc(nextDateKey(dateKey), 0, venue.timezone);

  const [rules, exceptions, prices] = await Promise.all([
    AvailabilityRuleModel.find({ venueId, dayOfWeek: weekday, isActive: true })
      .sort({ startMinute: 1 })
      .lean(),
    AvailabilityExceptionModel.find({ venueId, date: { $gte: dayStart, $lt: dayEnd } })
      .sort({ startMinute: 1 })
      .lean(),
    PriceRuleModel.find({ venueId, isActive: true }).lean(),
  ]);

  return { venue, pitch, rules, exceptions, prices };
}

function operatingWindows(
  context: AvailabilityContext
): Array<{ startMinute: number; endMinute: number }> {
  if (context.exceptions.some(exception => exception.kind === 'blackout')) return [];

  const specialOpenings = context.exceptions
    .filter(exception => exception.kind === 'special_open')
    .map(exception => ({
      startMinute: exception.startMinute ?? 0,
      endMinute: exception.endMinute ?? 1440,
    }));

  return specialOpenings.length > 0 ? specialOpenings : context.rules;
}

export function priceForInterval(
  prices: PriceRuleCandidate[],
  startAt: Date,
  endAt: Date,
  timezone: string,
  fallbackCurrency: string
): { priceMinor: number; currency: string } {
  const rule = selectPriceRule(prices, startAt, endAt, timezone);
  if (!rule) return { priceMinor: 0, currency: fallbackCurrency };

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  const priceMinor =
    rule.pricingUnit === 'hour'
      ? Math.ceil(durationMinutes / 60) * rule.amountMinor
      : rule.amountMinor;

  return { priceMinor, currency: rule.currency };
}

/**
 * Computes bookable intervals for one court on one local date, honouring
 * operating hours, blackouts, special openings, court buffers, existing
 * bookings and unexpired hold inventory.
 */
export async function calculateAvailability(
  venueId: string,
  pitchId: string,
  dateKey: string,
  durationMinutes: number
): Promise<AvailabilityInterval[]> {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
    throw ApiError.badRequest('durationMinutes must be a positive integer no greater than 1440');
  }

  const context = await loadAvailabilityContext(venueId, pitchId, dateKey);
  const { venue, pitch } = context;

  if (durationMinutes % pitch.slotIncrementMinutes !== 0) {
    throw ApiError.badRequest(
      `durationMinutes must be a multiple of ${pitch.slotIncrementMinutes}`
    );
  }

  const windows = operatingWindows(context);
  if (windows.length === 0) return [];

  const earliest = Math.min(...windows.map(window => window.startMinute));
  const latest = Math.max(...windows.map(window => window.endMinute));
  const rangeStart = zonedDateTimeToUtc(
    dateKey,
    Math.max(0, earliest - pitch.bufferBeforeMinutes),
    venue.timezone
  );
  const rangeEnd = zonedDateTimeToUtc(
    dateKey,
    Math.min(1440, latest + pitch.bufferAfterMinutes),
    venue.timezone
  );

  const now = new Date();
  const [bookings, inventory] = await Promise.all([
    BookingModel.find({
      pitchId,
      startAt: { $lt: rangeEnd },
      endAt: { $gt: rangeStart },
      ...activeBookingFilter(now),
    })
      .select('startAt endAt')
      .lean(),
    BookingInventoryModel.find({
      pitchId,
      slotStartAt: { $lt: rangeEnd, $gte: rangeStart },
      expiresAt: { $gt: now },
    })
      .select('slotStartAt')
      .lean(),
  ]);

  const occupiedSlots = new Set(inventory.map(item => item.slotStartAt.getTime()));
  const available: AvailabilityInterval[] = [];

  for (const window of windows) {
    const firstStart = window.startMinute + pitch.bufferBeforeMinutes;
    const lastStart = window.endMinute - durationMinutes - pitch.bufferAfterMinutes;

    for (
      let startMinute = firstStart;
      startMinute <= lastStart;
      startMinute += pitch.slotIncrementMinutes
    ) {
      const startAt = zonedDateTimeToUtc(dateKey, startMinute, venue.timezone);
      const endAt = zonedDateTimeToUtc(dateKey, startMinute + durationMinutes, venue.timezone);
      const occupiedStart = new Date(startAt.getTime() - pitch.bufferBeforeMinutes * 60 * 1000);
      const occupiedEnd = new Date(endAt.getTime() + pitch.bufferAfterMinutes * 60 * 1000);

      const conflictsWithBooking = bookings.some(booking =>
        intervalsOverlap(booking.startAt, booking.endAt, occupiedStart, occupiedEnd)
      );
      const conflictsWithInventory = slotKeys(
        occupiedStart,
        occupiedEnd,
        pitch.slotIncrementMinutes
      ).some(slot => occupiedSlots.has(slot.getTime()));

      if (conflictsWithBooking || conflictsWithInventory) continue;

      const { priceMinor, currency } = priceForInterval(
        context.prices,
        startAt,
        endAt,
        venue.timezone,
        venue.currency
      );

      available.push({
        startAt,
        endAt,
        startLocal: formatLocalTime(startAt, venue.timezone),
        endLocal: formatLocalTime(endAt, venue.timezone),
        timezone: venue.timezone,
        priceMinor,
        currency,
      });
    }
  }

  return available;
}

/** True when the venue is open for local play at the requested minute. */
export async function isVenueOpenAt(
  venue: { _id: Types.ObjectId; timezone: string },
  dateKey: string,
  minuteOfDay: number
): Promise<boolean> {
  const weekday = localDateParts(
    zonedDateTimeToUtc(dateKey, 720, venue.timezone),
    venue.timezone
  ).weekday;
  const dayStart = zonedDateTimeToUtc(dateKey, 0, venue.timezone);
  const dayEnd = zonedDateTimeToUtc(nextDateKey(dateKey), 0, venue.timezone);

  const [rules, exceptions] = await Promise.all([
    AvailabilityRuleModel.find({ venueId: venue._id, dayOfWeek: weekday, isActive: true }).lean(),
    AvailabilityExceptionModel.find({
      venueId: venue._id,
      date: { $gte: dayStart, $lt: dayEnd },
    }).lean(),
  ]);

  if (exceptions.some(exception => exception.kind === 'blackout')) return false;

  const specialOpenings = exceptions
    .filter(exception => exception.kind === 'special_open')
    .map(exception => ({
      startMinute: exception.startMinute ?? 0,
      endMinute: exception.endMinute ?? 1440,
    }));

  const windows = specialOpenings.length > 0 ? specialOpenings : rules;
  return windows.some(
    window => minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute
  );
}
