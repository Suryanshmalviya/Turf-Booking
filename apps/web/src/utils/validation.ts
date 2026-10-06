import { z } from 'zod';

import { todayIso } from './date';

/**
 * Mirrors `passwordSchema` in `apps/api/src/validators/common.validator.ts`:
 * 8–128 characters with at least one upper and one lower case letter. Keeping
 * the client rule identical avoids a form that passes locally and 400s remotely.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .min(1, 'Email address is required')
  .email('Enter a valid email address')
  .max(320, 'Email address is too long');

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[a-z]/, 'Include at least one lower case letter')
  .regex(/[A-Z]/, 'Include at least one upper case letter');

export const displayNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

/** Venue discovery filters. `maxPrice` is free text until submit. */
export const venueSearchSchema = z.object({
  q: z.string().trim().max(160, 'Search text is too long'),
  city: z.string().trim().max(100, 'City name is too long'),
  date: z.string(),
  time: z.string(),
  maxPrice: z.string().refine(
    value => value === '' || /^\d+(\.\d{1,2})?$/.test(value),
    'Enter a valid amount'
  ),
  feature: z.enum(['', 'indoor', 'outdoor']),
});

export type VenueSearchFormValues = z.infer<typeof venueSearchSchema>;

/** Court + date + duration selection on the availability page. */
export const bookingRequestSchema = z.object({
  pitchId: z.string().min(1, 'Choose a court'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
    .refine(value => value >= todayIso(), 'Choose today or later'),
  durationMinutes: z.coerce.number().int().positive().max(1440),
});

export type BookingRequestFormValues = z.infer<typeof bookingRequestSchema>;

/**
 * Cancellation reason. The API requires 1–500 characters; a floor of 3 keeps
 * accidental one-character cancellations out.
 */
export const cancelReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Tell us why you are cancelling')
    .max(500, 'Reason must be 500 characters or fewer'),
});

export type CancelReasonFormValues = z.infer<typeof cancelReasonSchema>;

export const CANCEL_REASON_OPTIONS = [
  'Schedule changed',
  'Court no longer available',
  'Duplicate booking',
  'Rain / weather',
  'Other',
] as const;

export const adminVenueSchema = z.object({
  name: z.string().trim().min(2, 'Venue name is required'),
  city: z.string().trim().min(2, 'City is required'),
  line1: z.string().trim(),
  description: z.string().trim(),
  courtName: z.string().trim().min(1, 'Court name is required'),
  courtSurface: z.string().trim().min(1, 'Surface is required'),
  pricePerHour: z.coerce.number().min(0, 'Price cannot be negative'),
  indoor: z.boolean(),
});

export type AdminVenueFormValues = z.infer<typeof adminVenueSchema>;

export const reviewReasonSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required for every administrative action'),
});

export type ReviewReasonFormValues = z.infer<typeof reviewReasonSchema>;

/** Booking history filters. */
export const bookingFilterSchema = z.object({
  status: z.string(),
  scope: z.enum(['all', 'upcoming', 'past']),
});

export type BookingFilterFormValues = z.infer<typeof bookingFilterSchema>;