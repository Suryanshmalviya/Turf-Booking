import { z } from 'zod';

import { PAYMENT_STATUSES } from '../types/enums';
import { paginationSchema, sortSchema } from './common.validator';

export const paymentAttemptParamsSchema = z.object({
  params: z.object({ bookingId: z.string().trim().min(1).max(64) }),
});

export const listPaymentAttemptsSchema = z.object({
  query: z.object({
    ...paginationSchema,
    bookingId: z.string().trim().min(1).max(64).optional(),
    status: z.enum(PAYMENT_STATUSES).optional(),
    sort: sortSchema,
  }),
});

export const reconcileSchema = z.object({
  body: z.object({}).passthrough().optional(),
});

export type ListPaymentAttemptsQuery = z.infer<typeof listPaymentAttemptsSchema>['query'];
