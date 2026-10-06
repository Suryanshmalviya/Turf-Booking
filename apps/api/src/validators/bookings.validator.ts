import { z } from 'zod';

import { BOOKING_STATUSES } from '../types/enums';
import {
  currencySchema,
  dateRangeQuerySchema,
  idempotencyKeySchema,
  objectIdSchema,
  paginationSchema,
  sortSchema,
  timezoneSchema,
} from './common.validator';

export const bookingIdParamsSchema = z.object({
  params: z.object({ bookingId: objectIdSchema }),
});

export const createHoldSchema = z.object({
  body: z.object({
    venueId: objectIdSchema,
    pitchId: objectIdSchema,
    startAt: z.coerce.date(),
    durationMinutes: z.number().int().positive().max(1440),
    idempotencyKey: idempotencyKeySchema.optional(),
  }),
});

export const confirmHoldSchema = bookingIdParamsSchema;

export const listMyBookingsSchema = z.object({
  query: z.object({
    ...paginationSchema,
    status: z.enum(BOOKING_STATUSES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    venueId: objectIdSchema.optional(),
    sort: sortSchema,
  }),
});

export const cancelBookingSchema = z.object({
  params: z.object({ bookingId: objectIdSchema }),
  body: z.object({
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: idempotencyKeySchema,
  }),
});

export const refundRequestSchema = z.object({
  params: z.object({ bookingId: objectIdSchema }),
  body: z.object({
    paymentAttemptId: objectIdSchema,
    amountMinor: z.number().int().positive(),
    currency: currencySchema,
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: idempotencyKeySchema,
  }),
});

export const venueCalendarSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  query: dateRangeQuerySchema,
});

/**
 * Standalone booking payload contract retained for internal and integration
 * callers that construct a booking snapshot directly.
 */
export const createBookingSchema = z
  .object({
    venueId: objectIdSchema,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    timezone: timezoneSchema,
    amountMinor: z.number().int().nonnegative(),
    currency: currencySchema,
  })
  .refine(value => value.endAt > value.startAt, {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });

export type CreateHoldBody = z.infer<typeof createHoldSchema>['body'];
export type ListMyBookingsQuery = z.infer<typeof listMyBookingsSchema>['query'];
export type CancelBookingBody = z.infer<typeof cancelBookingSchema>['body'];
export type RefundRequestBody = z.infer<typeof refundRequestSchema>['body'];