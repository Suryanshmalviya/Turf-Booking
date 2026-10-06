import { z } from 'zod';

import { VENUE_STATUSES } from '../types/enums';
import {
  dateRangeQuerySchema,
  objectIdSchema,
  paginationSchema,
  sortSchema,
  userRoleSchema,
  userStatusSchema,
} from './common.validator';

export const adminPageSchema = z.object({
  query: z.object({
    ...paginationSchema,
    q: z.string().trim().max(160).optional(),
    status: z.string().trim().max(40).optional(),
    sort: sortSchema,
  }),
});

export const adminBookingListSchema = z.object({
  query: z.object({
    ...paginationSchema,
    reference: z.string().trim().max(32).optional(),
    status: z.string().trim().max(40).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: sortSchema,
  }),
});

export const adminIdParamsSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

export const adminVenueActionSchema = z.object({
  params: z.object({
    venueId: objectIdSchema,
    action: z.enum(['active', 'rejected', 'suspended']),
  }),
  body: z.object({ reason: z.string().trim().min(1).max(1000) }),
});

export const adminReportSchema = z.object({ query: dateRangeQuerySchema });
export const adminExportSchema = z.object({ query: dateRangeQuerySchema });

export const adminCreateVenueSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional(),
    city: z.string().trim().min(1).max(100),
    line1: z.string().trim().max(200).optional().default('Main Court Avenue'),
    region: z.string().trim().max(100).optional().default('Metro'),
    postalCode: z.string().trim().max(20).optional().default('110001'),
    country: z.string().trim().length(2).toUpperCase().optional().default('IN'),
    timezone: z.string().trim().optional().default('Asia/Kolkata'),
    currency: z.string().trim().length(3).toUpperCase().optional().default('INR'),
    courtName: z.string().trim().min(1).max(100).optional().default('Court 1'),
    courtSurface: z.string().trim().max(80).optional().default('Pro Cushion Acrylic'),
    indoor: z.boolean().optional().default(false),
    pricePerHour: z.coerce.number().min(0).optional().default(500),
  }),
});

export const adminUpdateUserSchema = z.object({
  params: z.object({ userId: objectIdSchema }),
  body: z
    .object({
      role: userRoleSchema.optional(),
      status: userStatusSchema.optional(),
    })
    .refine(value => value.role !== undefined || value.status !== undefined, {
      message: 'Provide a role or a status to update',
    }),
});

export const adminVenueStatusFilterSchema = z.object({
  query: z.object({ status: z.enum(VENUE_STATUSES).optional() }),
});

export const adminProcessNotificationsSchema = z.object({
  body: z.object({}).passthrough().optional(),
});

export type AdminCreateVenueBody = z.infer<typeof adminCreateVenueSchema>['body'];
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserSchema>['body'];
