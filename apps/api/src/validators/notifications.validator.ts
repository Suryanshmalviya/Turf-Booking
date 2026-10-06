import { z } from 'zod';

import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from '../types/enums';
import { objectIdSchema, paginationSchema, sortSchema } from './common.validator';

export const listNotificationsSchema = z.object({
  query: z.object({
    ...paginationSchema,
    status: z.enum(NOTIFICATION_STATUSES).optional(),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    unreadOnly: z.coerce.boolean().optional(),
    sort: sortSchema,
  }),
});

export const notificationIdParamsSchema = z.object({
  params: z.object({ notificationId: objectIdSchema }),
});

export const markAllReadSchema = z.object({
  body: z.object({}).passthrough().optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>['query'];