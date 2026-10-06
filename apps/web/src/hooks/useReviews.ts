import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../services/queryKeys';
import {
  type CreateReviewInput,
  reviewApi,
  type ReviewListFilters,
  type ReviewStatus,
  type UpdateReviewInput,
} from '../services/review.api';

/** Reviews and the rating summary shown on a venue page. */

/** Public review feed, filterable by venue, rating and moderation status. */
export function useReviews(filters: ReviewListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviews.list(filters),
    queryFn: ({ signal }) => reviewApi.list(filters, signal),
    enabled,
  });
}

/** The signed-in customer's own reviews. */
export function useMyReviews(filters: { page?: number; limit?: number } = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviews.mine(filters),
    queryFn: ({ signal }) => reviewApi.listMine(filters, signal),
    enabled,
  });
}

export function useReview(reviewId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews.detail(reviewId ?? ''),
    queryFn: ({ signal }) => reviewApi.detail(reviewId as string, signal),
    enabled: Boolean(reviewId),
  });
}

/** Average rating and count for a venue. */
export function useVenueRating(venueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.venues.rating(venueId ?? ''),
    queryFn: ({ signal }) => reviewApi.summary(venueId as string, signal),
    enabled: Boolean(venueId),
  });
}

/** Leave a review for a completed booking. */
export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReviewInput) => reviewApi.create(input),
    onSuccess: result => {
      const venueId = result.review.venueId;
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() });
      // The venue page shows a rating badge that must reflect the new review.
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.rating(venueId) });
    },
  });
}

export function useUpdateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, input }: { reviewId: string; input: UpdateReviewInput }) =>
      reviewApi.update(reviewId, input),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(queryKeys.reviews.detail(variables.reviewId), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reviewId: string) => reviewApi.remove(reviewId),
    onSuccess: (_result, reviewId) => {
      queryClient.removeQueries({ queryKey: queryKeys.reviews.detail(reviewId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() });
    },
  });
}

/** Venue-side reply. */
export function useReplyToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, body }: { reviewId: string; body: string }) =>
      reviewApi.reply(reviewId, body),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(queryKeys.reviews.detail(variables.reviewId), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() });
    },
  });
}

/** Admin moderation. A reason is always sent so the audit trail explains itself. */
export function useModerateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reviewId,
      status,
      reason,
    }: {
      reviewId: string;
      status: ReviewStatus;
      reason?: string;
    }) => reviewApi.moderate(reviewId, status, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all() });
    },
  });
}
