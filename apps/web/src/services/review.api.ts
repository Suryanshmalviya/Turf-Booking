import type { PaginationMeta } from '../types/api';
import { buildQuery, request, requestWithMeta } from './api-client';

/** Customer reviews for completed bookings. */

export const REVIEW_STATUSES = ['pending', 'published', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewReply {
  body: string;
  createdAt: string;
  authorId?: string;
}

export interface Review {
  _id: string;
  venueId: string;
  pitchId?: string;
  bookingId?: string;
  userId?: string;
  rating: number;
  title?: string;
  comment: string;
  surfaceRating?: number;
  serviceRating?: number;
  status: ReviewStatus | string;
  /** Named `isVerifiedBooking` on the model and in every list projection. */
  isVerifiedBooking: boolean;
  reply?: ReviewReply;
  createdAt: string;
}

export interface VenueRatingSummary {
  average: number;
  count: number;
  breakdown?: Record<string, number>;
}

export interface CreateReviewInput {
  bookingId: string;
  rating: number;
  title?: string;
  comment: string;
  surfaceRating?: number;
  serviceRating?: number;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  comment?: string;
  surfaceRating?: number;
  serviceRating?: number;
}

export interface ReviewListFilters {
  venueId?: string;
  rating?: number;
  status?: ReviewStatus;
  verifiedOnly?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export const reviewApi = {
  /** Public review feed. Rows come back in `data`, pagination in `meta`. */
  async list(filters: ReviewListFilters = {}, signal?: AbortSignal) {
    const { data, meta } = await requestWithMeta<Review[]>(
      `/reviews${buildQuery({ ...filters })}`,
      { signal }
    );
    return { reviews: data ?? [], meta };
  },

  async listMine(filters: { page?: number; limit?: number } = {}, signal?: AbortSignal) {
    const { data, meta } = await requestWithMeta<Review[]>(
      `/reviews/mine${buildQuery({ ...filters })}`,
      { signal }
    );
    return { reviews: data ?? [], meta: meta as PaginationMeta | undefined };
  },

  summary(venueId: string, signal?: AbortSignal) {
    return request<{ rating: VenueRatingSummary }>(`/reviews/summary${buildQuery({ venueId })}`, {
      signal,
    });
  },

  detail(reviewId: string, signal?: AbortSignal) {
    return request<{ review: Review }>(`/reviews/${reviewId}`, { signal });
  },

  create(input: CreateReviewInput) {
    return request<{ review: Review }>('/reviews', { method: 'POST', body: input });
  },

  update(reviewId: string, input: UpdateReviewInput) {
    return request<{ review: Review }>(`/reviews/${reviewId}`, { method: 'PATCH', body: input });
  },

  remove(reviewId: string) {
    return request<void>(`/reviews/${reviewId}`, { method: 'DELETE' });
  },

  /** Venue-side response to a review. */
  reply(reviewId: string, body: string) {
    return request<{ review: Review }>(`/reviews/${reviewId}/replies`, {
      method: 'POST',
      body: { body },
    });
  },

  /** Admin moderation. */
  moderate(reviewId: string, status: ReviewStatus, reason?: string) {
    return request<{ review: Review }>(`/reviews/${reviewId}/moderation`, {
      method: 'PATCH',
      body: { status, ...(reason ? { reason } : {}) },
    });
  },
};
