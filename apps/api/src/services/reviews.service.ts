import { type FilterQuery,Types } from 'mongoose';

import { logger } from '../config';
import { AuditLogModel } from '../models/admin.model';
import { BookingModel } from '../models/bookings.model';
import { VenueModel } from '../models/courts.model';
import { type ReviewDocument, ReviewModel } from '../models/reviews.model';
import { VenueStaffAssignmentModel } from '../models/users.model';
import type { JwtPayload } from '../types/auth';
import type { ReviewStatus } from '../types/enums';
import type { SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginateWithMeta } from '../utils/paginate';
import { withLegacyPagination } from '../utils/pagination';
import { parseSort, type SortWhitelist } from '../utils/sort';

const REVIEWABLE_BOOKING_STATUSES = ['confirmed', 'completed'] as const;

const REVIEW_SORT_WHITELIST: SortWhitelist = {
  createdAt: 1,
  updatedAt: 1,
  rating: 1,
};

const REVIEW_SORT_FALLBACK: SortSpec = { createdAt: -1 };

export interface ReviewListQuery {
  page: number;
  limit: number;
  venueId?: string;
  rating?: number;
  status?: ReviewStatus;
  verifiedOnly?: boolean;
  sort?: string;
}

export interface RatingSummary {
  venueId: string;
  average: number;
  count: number;
  distribution: Record<string, number>;
}

interface RatingAggregateRow {
  _id: number;
  count: number;
}

async function canManageVenue(venueId: string, actor: JwtPayload): Promise<boolean> {
  if (actor.role === 'admin') return true;
  if (actor.role === 'venue_owner') {
    return Boolean(await VenueModel.exists({ _id: venueId, ownerId: actor.sub }));
  }
  if (actor.role === 'venue_staff') {
    return Boolean(
      await VenueStaffAssignmentModel.exists({ venueId, userId: actor.sub, active: true })
    );
  }
  return false;
}

/**
 * A review may only be created for a booking the customer actually completed at
 * the venue, and only once per booking (enforced by the unique index).
 */
export async function createReview(
  userId: string,
  input: {
    bookingId: string;
    rating: number;
    title?: string;
    comment: string;
    surfaceRating?: number;
    serviceRating?: number;
  }
) {
  const booking = await BookingModel.findOne({
    _id: input.bookingId,
    userId,
    status: { $in: [...REVIEWABLE_BOOKING_STATUSES] },
  })
    .select('venueId status startAt')
    .lean();

  if (!booking) {
    throw ApiError.notFound('Eligible booking');
  }

  const existing = await ReviewModel.exists({ bookingId: input.bookingId, userId });
  if (existing) throw ApiError.conflict('You have already reviewed this booking');

  const review = await ReviewModel.create({
    venueId: booking.venueId,
    bookingId: booking._id,
    userId,
    rating: input.rating,
    ...(input.title ? { title: input.title } : {}),
    comment: input.comment,
    ...(input.surfaceRating ? { surfaceRating: input.surfaceRating } : {}),
    ...(input.serviceRating ? { serviceRating: input.serviceRating } : {}),
    status: 'published',
    isVerifiedBooking: true,
  });

  logger.info({ reviewId: review._id, venueId: String(booking.venueId) }, 'Review created');
  return review;
}

export async function listReviews(query: ReviewListQuery) {
  const filter: FilterQuery<ReviewDocument> = {
    status: query.status ?? 'published',
  };
  if (query.venueId) filter['venueId'] = query.venueId;
  if (query.rating !== undefined) filter['rating'] = query.rating;
  if (query.verifiedOnly) filter['isVerifiedBooking'] = true;

  const page = await paginateWithMeta<ReviewDocument, Record<string, unknown>>(
    ReviewModel,
    filter,
    {
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, REVIEW_SORT_WHITELIST, REVIEW_SORT_FALLBACK),
      select: 'rating title comment surfaceRating serviceRating isVerifiedBooking reply createdAt updatedAt userId venueId',
    }
  );

  return withLegacyPagination(page);
}

export async function listMyReviews(query: {
  page: number;
  limit: number;
  userId: string;
  sort?: string;
}) {
  const page = await paginateWithMeta<ReviewDocument, Record<string, unknown>>(
    ReviewModel,
    { userId: query.userId },
    {
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, REVIEW_SORT_WHITELIST, REVIEW_SORT_FALLBACK),
      select: 'rating title comment surfaceRating serviceRating status isVerifiedBooking reply createdAt updatedAt venueId bookingId',
    }
  );

  return withLegacyPagination(page);
}

export async function getReview(reviewId: string) {
  const review = await ReviewModel.findById(reviewId).lean();
  if (!review) throw ApiError.notFound('Review');
  return review;
}

/** Authors may edit their own review; venue operators and admins may correct any. */
export async function updateReview(
  reviewId: string,
  actor: JwtPayload,
  input: {
    rating?: number;
    title?: string;
    comment?: string;
    surfaceRating?: number;
    serviceRating?: number;
  }
) {
  const review = await ReviewModel.findById(reviewId);
  if (!review) throw ApiError.notFound('Review');

  const isAuthor = review.userId.toString() === actor.sub;
  if (!isAuthor && !(await canManageVenue(review.venueId.toString(), actor))) {
    throw ApiError.forbidden('You do not have access to this review');
  }
  if (review.status === 'hidden' && !isAuthor) {
    throw ApiError.forbidden('Hidden reviews can only be edited by their author');
  }

  if (input.rating !== undefined) review.rating = input.rating;
  if (input.title !== undefined) review.title = input.title;
  if (input.comment !== undefined) review.comment = input.comment;
  if (input.surfaceRating !== undefined) review.surfaceRating = input.surfaceRating;
  if (input.serviceRating !== undefined) review.serviceRating = input.serviceRating;

  await review.save();
  return review;
}

export async function deleteReview(reviewId: string, actor: JwtPayload): Promise<void> {
  const review = await ReviewModel.findById(reviewId);
  if (!review) throw ApiError.notFound('Review');

  const isAuthor = review.userId.toString() === actor.sub;
  if (!isAuthor && !(await canManageVenue(review.venueId.toString(), actor))) {
    throw ApiError.forbidden('You do not have access to this review');
  }

  await review.deleteOne();
  logger.info({ reviewId, actorId: actor.sub }, 'Review deleted');
}

/** Venue operator response, stored inline on the review. */
export async function replyToReview(reviewId: string, actor: JwtPayload, body: string) {
  const review = await ReviewModel.findById(reviewId);
  if (!review) throw ApiError.notFound('Review');
  if (!(await canManageVenue(review.venueId.toString(), actor))) {
    throw ApiError.forbidden('You do not have access to this venue');
  }

  review.reply = { authorId: new Types.ObjectId(actor.sub), body, createdAt: new Date() };
  await review.save();
  return review;
}

export async function moderateReview(input: {
  reviewId: string;
  adminId: string;
  status: ReviewStatus;
  reason?: string;
  requestId?: string;
}) {
  const review = await ReviewModel.findByIdAndUpdate(
    input.reviewId,
    {
      $set: {
        status: input.status,
        moderatedBy: input.adminId,
        moderatedAt: new Date(),
        ...(input.reason ? { moderationReason: input.reason } : {}),
      },
    },
    { new: true, runValidators: true }
  );
  if (!review) throw ApiError.notFound('Review');

  await AuditLogModel.create({
    actorId: input.adminId,
    action: `review.${input.status}`,
    resourceType: 'Review',
    resourceId: review._id,
    requestId: input.requestId,
    metadata: { reason: input.reason ?? '' },
  });

  return review;
}

/** Aggregate rating used on the public court detail payload. */
export async function getVenueRatingSummary(venueId: string): Promise<RatingSummary> {
  if (!Types.ObjectId.isValid(venueId)) {
    return { venueId, average: 0, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } };
  }

  const rows = await ReviewModel.aggregate<RatingAggregateRow>([
    { $match: { venueId: new Types.ObjectId(venueId), status: 'published' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let total = 0;
  let weighted = 0;

  for (const row of rows) {
    const rating = Number(row._id);
    const count = Number(row.count);
    distribution[String(rating)] = count;
    total += count;
    weighted += rating * count;
  }

  return {
    venueId,
    average: total === 0 ? 0 : Math.round((weighted / total) * 100) / 100,
    count: total,
    distribution,
  };
}