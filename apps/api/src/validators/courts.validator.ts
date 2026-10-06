import { z } from 'zod';

import {
  AVAILABILITY_EXCEPTION_KINDS,
  PRICING_UNITS,
  VENUE_STATUSES,
} from '../types/enums';
import { isIanaTimezone } from '../utils/timezone';
import {
  currencySchema,
  dateKeySchema,
  objectIdSchema,
  paginationSchema,
  sortSchema,
  timeKeySchema,
} from './common.validator';

const timezoneSchema = z.string().refine(isIanaTimezone, 'Must be a valid IANA timezone');

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country: z
    .string()
    .trim()
    .length(2)
    .transform(value => value.toUpperCase()),
});

const imageSchema = z.object({
  key: z.string().trim().min(1).max(500),
  url: z.string().url().max(2000).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  altText: z.string().trim().max(200).optional(),
});

// ---------------------------------------------------------------- venues

const venueBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  timezone: timezoneSchema,
  currency: currencySchema.optional(),
  address: addressSchema,
  location: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    })
    .optional(),
  images: z.array(imageSchema).max(20).optional(),
});

export const createCourtSchema = z.object({ body: venueBodySchema });

export const updateCourtSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: venueBodySchema.partial().refine(value => Object.keys(value).length > 0, {
    message: 'At least one court field must be provided',
  }),
});

export const courtIdParamsSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
});

export const listCourtsSchema = z.object({
  query: z.object({
    ...paginationSchema,
    city: z.string().trim().max(100).optional(),
    q: z.string().trim().max(160).optional(),
    date: dateKeySchema.optional(),
    time: timeKeySchema.optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    feature: z.enum(['indoor', 'outdoor']).optional(),
    status: z.enum(VENUE_STATUSES).optional(),
    sort: sortSchema,
  }),
});

export const courtReviewSchema = z.object({
  params: z.object({
    venueId: objectIdSchema,
    action: z.enum(['active', 'rejected', 'suspended']),
  }),
  body: z.object({ reason: z.string().trim().min(1).max(1000) }),
});

export const venueReviewSchema = courtReviewSchema;

// ---------------------------------------------------------------- courts (pitches)

const courtBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  surface: z.string().trim().max(80).optional(),
  indoor: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  slotIncrementMinutes: z.number().int().min(5).max(240).default(30),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
});

export const createCourtPitchSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: courtBodySchema,
});

export const updateCourtPitchSchema = z.object({
  params: z.object({ venueId: objectIdSchema, pitchId: objectIdSchema }),
  body: courtBodySchema.partial().refine(value => Object.keys(value).length > 0, {
    message: 'At least one court field must be provided',
  }),
});

export const courtPitchParamsSchema = z.object({
  params: z.object({ venueId: objectIdSchema, pitchId: objectIdSchema }),
});

// ---------------------------------------------------------------- availability

const intervalShape = {
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
};

export const createAvailabilityRuleSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: z
    .object({
      dayOfWeek: z.number().int().min(0).max(6),
      ...intervalShape,
      isActive: z.boolean().default(true),
    })
    .refine(value => value.endMinute > value.startMinute, {
      message: 'endMinute must be after startMinute',
      path: ['endMinute'],
    }),
});

export const createAvailabilityExceptionSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: z
    .object({
      date: z.coerce.date(),
      kind: z.enum(AVAILABILITY_EXCEPTION_KINDS),
      startMinute: z.number().int().min(0).max(1439).optional(),
      endMinute: z.number().int().min(1).max(1440).optional(),
      reason: z.string().trim().max(500).optional(),
    })
    .superRefine((value, context) => {
      if (
        value.kind === 'special_open' &&
        (value.startMinute === undefined || value.endMinute === undefined)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startMinute'],
          message: 'Special open periods require startMinute and endMinute',
        });
      }
      if (
        value.startMinute !== undefined &&
        value.endMinute !== undefined &&
        value.endMinute <= value.startMinute
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endMinute'],
          message: 'endMinute must be after startMinute',
        });
      }
    }),
});

export const availabilityQuerySchema = z.object({
  params: z.object({ venueId: objectIdSchema, pitchId: objectIdSchema }),
  query: z.object({
    date: dateKeySchema,
    durationMinutes: z.coerce.number().int().positive().max(1440),
  }),
});

// ---------------------------------------------------------------- pricing

export const createPriceRuleSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: z
    .object({
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startMinute: z.number().int().min(0).max(1439).optional(),
      endMinute: z.number().int().min(1).max(1440).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      minDurationMinutes: z.number().int().positive().max(1440).optional(),
      maxDurationMinutes: z.number().int().positive().max(1440).optional(),
      amountMinor: z.number().int().nonnegative(),
      currency: currencySchema,
      pricingUnit: z.enum(PRICING_UNITS).default('booking'),
      priority: z.number().int().min(0).default(0),
      isActive: z.boolean().default(true),
    })
    .superRefine((value, context) => {
      if (
        value.startMinute !== undefined &&
        value.endMinute !== undefined &&
        value.endMinute <= value.startMinute
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endMinute'],
          message: 'endMinute must be after startMinute',
        });
      }
      if (value.startDate && value.endDate && value.endDate < value.startDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'endDate must be on or after startDate',
        });
      }
      if (
        value.minDurationMinutes !== undefined &&
        value.maxDurationMinutes !== undefined &&
        value.maxDurationMinutes < value.minDurationMinutes
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxDurationMinutes'],
          message: 'maxDurationMinutes must be at least minDurationMinutes',
        });
      }
    }),
});

// ---------------------------------------------------------------- operator

export const calendarQuerySchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  query: z
    .object({
      from: z.coerce.date(),
      to: z.coerce.date(),
    })
    .refine(value => value.to >= value.from, { message: 'to must be on or after from' }),
});

export const blackoutSchema = z.object({
  params: z.object({ venueId: objectIdSchema }),
  body: z.object({ date: z.coerce.date(), reason: z.string().trim().min(1).max(500) }),
});

export type CreateCourtBody = z.infer<typeof venueBodySchema>;
export type UpdateCourtBody = z.infer<typeof updateCourtSchema>['body'];
export type ListCourtsQuery = z.infer<typeof listCourtsSchema>['query'];
export type CreateAvailabilityExceptionBody = z.infer<
  typeof createAvailabilityExceptionSchema
>['body'];
export type CreateAvailabilityRuleBody = z.infer<typeof createAvailabilityRuleSchema>['body'];
export type CreatePriceRuleBody = z.infer<typeof createPriceRuleSchema>['body'];
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>['query'];
export type CalendarQuery = z.infer<typeof calendarQuerySchema>['query'];