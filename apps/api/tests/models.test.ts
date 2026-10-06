import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { BookingModel } from '../src/models/bookings.model';
import { VenueModel } from '../src/models/courts.model';
import { NotificationModel } from '../src/models/notifications.model';
import { PaymentAttemptModel, RefundModel } from '../src/models/payments.model';
import { ReviewModel } from '../src/models/reviews.model';
import { UserModel } from '../src/models/users.model';

const ids = {
  userId: new Types.ObjectId(),
  venueId: new Types.ObjectId(),
  pitchId: new Types.ObjectId(),
};

describe('booking model', () => {
  const baseBooking = {
    userId: ids.userId,
    venueId: ids.venueId,
    pitchId: ids.pitchId,
    publicReference: 'PB-TEST-001',
    startAt: new Date('2026-01-01T10:00:00Z'),
    endAt: new Date('2026-01-01T11:00:00Z'),
    timezone: 'Asia/Kolkata',
    amountMinor: 1500,
    currency: 'INR',
    cancellationPolicy: {
      freeUntilMinutesBefore: 1440,
      refundPercent: 100,
      capturedAt: new Date(),
    },
  };

  it('applies timestamps, references and money validation', () => {
    const booking = new BookingModel(baseBooking);

    expect(booking.validateSync()).toBeUndefined();
    expect(booking.schema.path('userId').options.ref).toBe('User');
    expect(booking.schema.path('amountMinor').options.validate).toBeDefined();
    expect(booking.schema.options.timestamps).toBe(true);
  });

  it('rejects a booking whose end instant precedes its start instant', () => {
    const booking = new BookingModel({
      ...baseBooking,
      publicReference: 'PB-TEST-002',
      startAt: new Date('2026-01-01T11:00:00Z'),
      endAt: new Date('2026-01-01T10:00:00Z'),
      timezone: 'UTC',
      currency: 'USD',
    });

    expect(booking.validateSync()?.errors.endAt).toBeDefined();
  });

  it('rejects fractional money amounts', () => {
    const booking = new BookingModel({ ...baseBooking, publicReference: 'PB-TEST-003', amountMinor: 12.5 });

    expect(booking.validateSync()?.errors.amountMinor).toBeDefined();
  });
});

describe('user and venue models', () => {
  it('defines uniqueness and indexes for user and venue lookup fields', () => {
    expect(UserModel.schema.path('email').options.unique).toBe(true);
    expect(UserModel.schema.path('passwordHash').options.select).toBe(false);
    expect(VenueModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ status: 1, name: 1 }, expect.any(Object)],
        [{ location: '2dsphere' }, expect.any(Object)],
      ])
    );
  });
});

describe('review model', () => {
  const baseReview = {
    venueId: ids.venueId,
    bookingId: new Types.ObjectId(),
    userId: ids.userId,
    rating: 4,
    comment: 'Great courts and friendly staff.',
  };

  it('accepts a valid review and defaults to published', () => {
    const review = new ReviewModel(baseReview);

    expect(review.validateSync()).toBeUndefined();
    expect(review.status).toBe('published');
    expect(review.isVerifiedBooking).toBe(false);
  });

  it('enforces a 1-5 integer rating', () => {
    expect(new ReviewModel({ ...baseReview, rating: 0 }).validateSync()?.errors.rating).toBeDefined();
    expect(new ReviewModel({ ...baseReview, rating: 6 }).validateSync()?.errors.rating).toBeDefined();
    expect(
      new ReviewModel({ ...baseReview, rating: 4.5 }).validateSync()?.errors.rating
    ).toBeDefined();
  });

  it('allows only one review per booking and indexes venue listings', () => {
    expect(ReviewModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ bookingId: 1, userId: 1 }, expect.objectContaining({ unique: true })],
        [{ venueId: 1, status: 1, createdAt: -1 }, expect.any(Object)],
      ])
    );
  });
});

describe('payment and notification models', () => {
  it('requires idempotency keys and defines webhook deduplication indexes', () => {
    const attempt = new PaymentAttemptModel({
      bookingId: '507f1f77bcf86cd799439011',
      provider: 'development_mock',
      idempotencyKey: 'attempt-1',
      status: 'pending',
      amountMinor: 1200,
      currency: 'INR',
    });

    expect(attempt.validateSync()).toBeUndefined();
    expect(PaymentAttemptModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ bookingId: 1, idempotencyKey: 1 }, expect.objectContaining({ unique: true })],
      ])
    );
  });

  it('starts refunds in the requested state and indexes idempotency', () => {
    const refund = new RefundModel({
      bookingId: '507f1f77bcf86cd799439011',
      paymentAttemptId: '507f1f77bcf86cd799439012',
      amountMinor: 100,
      currency: 'INR',
      idempotencyKey: 'refund-1',
      reason: 'Customer cancellation',
    });

    expect(refund.validateSync()).toBeUndefined();
    expect(refund.status).toBe('requested');
    expect(RefundModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ bookingId: 1, idempotencyKey: 1 }, expect.objectContaining({ unique: true })],
      ])
    );
  });

  it('tracks read state for notification inbox queries', () => {
    expect(NotificationModel.schema.path('readAt')).toBeDefined();
    expect(NotificationModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ deduplicationKey: 1 }, expect.objectContaining({ unique: true })],
        [{ userId: 1, readAt: 1, createdAt: -1 }, expect.any(Object)],
      ])
    );
  });
});