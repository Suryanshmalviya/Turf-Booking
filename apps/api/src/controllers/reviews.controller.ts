import type { Request, Response } from 'express';

import {
  createReview,
  deleteReview,
  getReview,
  getVenueRatingSummary,
  listMyReviews,
  listReviews,
  moderateReview,
  replyToReview,
  updateReview,
} from '../services/reviews.service';
import type { PaginationInput } from '../types/pagination';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import type {
  CreateReviewBody,
  ListReviewsQuery,
  ModerateReviewBody,
  UpdateReviewBody,
} from '../validators/reviews.validator';

export const list = asyncHandler(async (request: Request, response: Response) => {
  const result = await listReviews(request.query as unknown as ListReviewsQuery);
  sendSuccess(response, result.items, { meta: result.meta });
});

export const listMine = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as PaginationInput & { sort?: string };
  const result = await listMyReviews({ ...query, userId: request.user!.sub });
  sendSuccess(response, result.items, { meta: result.meta });
});

export const create = asyncHandler(async (request: Request, response: Response) => {
  const review = await createReview(request.user!.sub, request.body as CreateReviewBody);
  sendCreated(response, { review });
});

export const detail = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, { review: await getReview(request.params.reviewId) });
});

export const update = asyncHandler(async (request: Request, response: Response) => {
  const review = await updateReview(
    request.params.reviewId,
    request.user!,
    request.body as UpdateReviewBody
  );
  sendSuccess(response, { review });
});

export const remove = asyncHandler(async (request: Request, response: Response) => {
  await deleteReview(request.params.reviewId, request.user!);
  sendNoContent(response);
});

export const reply = asyncHandler(async (request: Request, response: Response) => {
  const review = await replyToReview(
    request.params.reviewId,
    request.user!,
    request.body.body as string
  );
  sendCreated(response, { review });
});

export const moderate = asyncHandler(async (request: Request, response: Response) => {
  const body = request.body as ModerateReviewBody;
  const review = await moderateReview({
    reviewId: request.params.reviewId,
    adminId: request.user!.sub,
    status: body.status,
    reason: body.reason,
    requestId: request.requestId,
  });
  sendSuccess(response, { review });
});

export const summary = asyncHandler(async (request: Request, response: Response) => {
  const venueId = (request.query.venueId as string | undefined) ?? request.params.venueId;
  sendSuccess(response, { rating: await getVenueRatingSummary(venueId) });
});