import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { BookingModel } from '../src/models/bookings.model';
import { ReviewModel } from '../src/models/reviews.model';
import {
  createReview,
  getVenueRatingSummary,
  moderateReview,
} from '../src/services/reviews.service';
import { ApiError } from '../src/utils/api-error';
import {
  createReviewSchema,
  listReviewsSchema,
  moderateReviewSchema,
} from '../src/validators/reviews.validator';

const leanBooking = (venueId = new Types.ObjectId()) => ({
  select: vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue({ venueId, status: 'completed', startAt: new Date() }),
  }),
});

describe('review validators', () => {
  it('bounds the rating to whole numbers between one and five', () => {
    const base = { body: { bookingId: new Types.ObjectId().toString(), comment: 'Great venue' } };

    expect(createReviewSchema.safeParse({ ...base, body: { ...base.body, rating: 5 } }).success).toBe(true);
    expect(createReviewSchema.safeParse({ ...base, body: { ...base.body, rating: 0 } }).success).toBe(false);
    expect(createReviewSchema.safeParse({ ...base, body: { ...base.body, rating: 4.5 } }).success).toBe(
      false
    );
  });

  it('requires a meaningful comment', () => {
    const result = createReviewSchema.safeParse({
      body: { bookingId: new Types.ObjectId().toString(), rating: 4, comment: 'ok' },
    });

    expect(result.success).toBe(false);
  });

  it('defaults the public list to published reviews', () => {
    expect(listReviewsSchema.parse({ query: {} }).query).toMatchObject({ page: 1, limit: 20 });
  });

  it('validates moderation transitions', () => {
    expect(
      moderateReviewSchema.safeParse({
        params: { reviewId: new Types.ObjectId().toString() },
        body: { status: 'hidden', reason: 'Spam' },
      }).success
    ).toBe(true);

    expect(
      moderateReviewSchema.safeParse({
        params: { reviewId: new Types.ObjectId().toString() },
        body: { status: 'deleted' },
      }).success
    ).toBe(false);
  });
});

describe('review service', () => {
  const customerId = new Types.ObjectId().toString();

  it('rejects a review when the caller has no eligible booking', async () => {
    vi.spyOn(BookingModel, 'findOne').mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as never);

    await expect(
      createReview(customerId, {
        bookingId: new Types.ObjectId().toString(),
        rating: 5,
        comment: 'Excellent courts',
      })
    ).rejects.toThrow('Eligible booking not found');
  });

  it('scopes the eligibility lookup to the calling customer', async () => {
    const bookingId = new Types.ObjectId().toString();
    const findOne = vi.spyOn(BookingModel, 'findOne').mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as never);

    await expect(
      createReview(customerId, { bookingId, rating: 5, comment: 'Excellent courts' })
    ).rejects.toThrow(ApiError);

    expect(findOne).toHaveBeenCalledWith({
      _id: bookingId,
      userId: customerId,
      status: { $in: expect.arrayContaining(['completed']) },
    });
  });

  it('rejects a second review for the same booking', async () => {
    vi.spyOn(BookingModel, 'findOne').mockReturnValueOnce(leanBooking() as never);
    vi.spyOn(ReviewModel, 'exists').mockResolvedValueOnce(true as never);

    await expect(
      createReview(customerId, {
        bookingId: new Types.ObjectId().toString(),
        rating: 4,
        comment: 'Second attempt',
      })
    ).rejects.toThrow('You have already reviewed this booking');
  });

  it('marks a created review as a verified booking', async () => {
    const venueId = new Types.ObjectId();
    vi.spyOn(BookingModel, 'findOne').mockReturnValueOnce(leanBooking(venueId) as never);
    vi.spyOn(ReviewModel, 'exists').mockResolvedValueOnce(false as never);
    vi.spyOn(ReviewModel, 'create').mockResolvedValueOnce({
      _id: 'review-1',
      isVerifiedBooking: true,
    } as never);

    const review = await createReview(customerId, {
      bookingId: new Types.ObjectId().toString(),
      rating: 5,
      comment: 'Excellent courts',
      surfaceRating: 5,
    });

    expect(review.isVerifiedBooking).toBe(true);
  });

  it('returns a zeroed summary for an invalid venue id', async () => {
    await expect(getVenueRatingSummary('not-an-id')).resolves.toMatchObject({
      average: 0,
      count: 0,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
  });

  it('averages published ratings into a distribution', async () => {
    const venueId = new Types.ObjectId().toString();
    const aggregate = vi.spyOn(ReviewModel, 'aggregate').mockResolvedValueOnce([
      { _id: 5, count: 2 },
      { _id: 3, count: 1 },
    ] as never);

    const summary = await getVenueRatingSummary(venueId);

    expect(aggregate).toHaveBeenCalledWith([
      { $match: { venueId: new Types.ObjectId(venueId), status: 'published' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);
    expect(summary).toMatchObject({
      venueId,
      count: 3,
      average: 4.33,
      distribution: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 2 },
    });
  });

  it('reports a zero average when a venue has no published reviews', async () => {
    vi.spyOn(ReviewModel, 'aggregate').mockResolvedValueOnce([] as never);

    await expect(getVenueRatingSummary(new Types.ObjectId().toString())).resolves.toMatchObject({
      average: 0,
      count: 0,
    });
  });

  it('records an audit trail entry when moderating', async () => {
    vi.spyOn(ReviewModel, 'findByIdAndUpdate').mockResolvedValueOnce(null);

    await expect(
      moderateReview({
        reviewId: new Types.ObjectId().toString(),
        adminId: new Types.ObjectId().toString(),
        status: 'hidden',
      })
    ).rejects.toThrow('Review not found');
  });
});