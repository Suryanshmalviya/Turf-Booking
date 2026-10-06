import { z } from 'zod';

import { REVIEW_STATUSES } from '../types/enums';
import { objectIdSchema, paginationSchema, sortSchema } from './common.validator';

const ratingSchema = z
  .number()
  .int()
  .min(1, 'Rating must be between 1 and 5')
  .max(5, 'Rating must be between 1 and 5');

export const createReviewSchema = z.object({
  body: z.object({
    bookingId: objectIdSchema,
    rating: ratingSchema,
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().min(3).max(2000),
    surfaceRating: ratingSchema.optional(),
    serviceRating: ratingSchema.optional(),
  }),
});

export const listReviewsSchema = z.object({
  query: z.object({
    ...paginationSchema,
    venueId: objectIdSchema.optional(),
    rating: ratingSchema.optional(),
    status: z.enum(REVIEW_STATUSES).optional(),
    verifiedOnly: z.coerce.boolean().optional(),
    sort: sortSchema,
  }),
});

export const listMyReviewsSchema = z.object({
  query: z.object({ ...paginationSchema, sort: sortSchema }),
});

export const reviewIdParamsSchema = z.object({
  params: z.object({ reviewId: objectIdSchema }),
});

export const updateReviewSchema = z.object({
  params: z.object({ reviewId: objectIdSchema }),
  body: z
    .object({
      rating: ratingSchema.optional(),
      title: z.string().trim().max(120).optional(),
      comment: z.string().trim().min(3).max(2000).optional(),
      surfaceRating: ratingSchema.optional(),
      serviceRating: ratingSchema.optional(),
    })
    .refine(value => Object.keys(value).length > 0, {
      message: 'At least one review field must be provided',
    }),
});

export const replyToReviewSchema = z.object({
  params: z.object({ reviewId: objectIdSchema }),
  body: z.object({ body: z.string().trim().min(1).max(1000) }),
});

export const moderateReviewSchema = z.object({
  params: z.object({ reviewId: objectIdSchema }),
  body: z.object({
    status: z.enum(REVIEW_STATUSES),
    reason: z.string().trim().min(1).max(500).optional(),
  }),
});

export const reviewSummarySchema = z.object({
  query: z.object({ venueId: objectIdSchema }),
});

export type CreateReviewBody = z.infer<typeof createReviewSchema>['body'];
export type ListReviewsQuery = z.infer<typeof listReviewsSchema>['query'];
export type UpdateReviewBody = z.infer<typeof updateReviewSchema>['body'];
export type ModerateReviewBody = z.infer<typeof moderateReviewSchema>['body'];
