import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { BookingModel } from '../src/models/bookings.model';
import { VenueModel } from '../src/models/courts.model';
import { cancelBooking, createBookingHold } from '../src/services/bookings.service';
import { operatorBlackout } from '../src/services/courts.service';
import type { JwtPayload } from '../src/types/auth';
import { createBookingSchema, listMyBookingsSchema } from '../src/validators/bookings.validator';

const actor = (role: JwtPayload['role'], sub = new Types.ObjectId().toString()): JwtPayload => ({
  sub,
  email: `${role}@example.com`,
  role,
  jti: 'token-id',
});

const bookingId = () => new Types.ObjectId().toString();

describe('booking validation', () => {
  it('accepts UTC instants with an IANA venue timezone and minor-unit money', () => {
    const result = createBookingSchema.safeParse({
      venueId: '507f1f77bcf86cd799439011',
      startAt: '2026-01-01T10:00:00Z',
      endAt: '2026-01-01T11:00:00Z',
      timezone: 'Asia/Kolkata',
      amountMinor: 1250,
      currency: 'INR',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid ids, timezone values and reversed intervals', () => {
    const result = createBookingSchema.safeParse({
      venueId: 'bad-id',
      startAt: '2026-01-01T11:00:00Z',
      endAt: '2026-01-01T10:00:00Z',
      timezone: 'IST',
      amountMinor: 12.5,
      currency: 'rupees',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.length).toBeGreaterThan(3);
  });

  it('coerces pagination defaults and constrains status filters', () => {
    expect(listMyBookingsSchema.parse({ query: {} }).query).toMatchObject({ page: 1, limit: 20 });
    expect(listMyBookingsSchema.safeParse({ query: { status: 'archived' } }).success).toBe(false);
  });
});

describe('booking lifecycle', () => {
  it('requires a reason before a cancellation can proceed', async () => {
    await expect(
      cancelBooking({
        bookingId: bookingId(),
        actor: actor('admin'),
        reason: ' ',
        idempotencyKey: 'refund-key-1',
      })
    ).rejects.toThrow('Cancellation reason is required');
  });

  it('refuses to cancel a booking that is already terminal', async () => {
    vi.spyOn(BookingModel, 'findOne').mockResolvedValueOnce({
      status: 'cancelled',
      save: vi.fn(),
    } as never);

    await expect(
      cancelBooking({
        bookingId: bookingId(),
        actor: actor('admin'),
        reason: 'Duplicate request',
        idempotencyKey: 'refund-key-2',
      })
    ).rejects.toThrow('Booking cannot be cancelled in its current state');
  });

  it('scopes a customer cancellation to their own bookings', async () => {
    const me = new Types.ObjectId().toString();
    const findOne = vi.spyOn(BookingModel, 'findOne').mockResolvedValueOnce(null);

    await expect(
      cancelBooking({
        bookingId: bookingId(),
        actor: actor('customer', me),
        reason: 'Plans changed',
        idempotencyKey: 'refund-key-3',
      })
    ).rejects.toThrow('Booking not found');

    expect(findOne).toHaveBeenCalledWith({ _id: expect.any(String), userId: me });
  });

  it('lets an operator cancel any booking in their scope', async () => {
    const findOne = vi.spyOn(BookingModel, 'findOne').mockResolvedValueOnce(null);

    await expect(
      cancelBooking({
        bookingId: bookingId(),
        actor: actor('admin'),
        reason: 'Facility closure',
        idempotencyKey: 'refund-key-4',
      })
    ).rejects.toThrow('Booking not found');

    expect(findOne).toHaveBeenCalledWith({ _id: expect.any(String) });
  });
});

describe('booking holds', () => {
  it('refuses to reserve a slot without a transactional connection', async () => {
    const venueLookup = vi.spyOn(VenueModel, 'findOne');

    await expect(
      createBookingHold({
        userId: new Types.ObjectId().toString(),
        venueId: new Types.ObjectId().toString(),
        pitchId: new Types.ObjectId().toString(),
        startAt: new Date('2026-06-01T10:00:00Z'),
        durationMinutes: 60,
        idempotencyKey: 'hold-key-1',
      })
    ).rejects.toThrow('Database is not connected');

    expect(venueLookup).not.toHaveBeenCalled();
  });
});

describe('operator blackout', () => {
  it('requires a reason for blackouts', async () => {
    await expect(
      operatorBlackout({
        venueId: '507f1f77bcf86cd799439011',
        actor: actor('admin'),
        date: new Date(),
        reason: '',
      })
    ).rejects.toThrow('Blackout reason is required');
  });

  it('requires the caller to own the venue', async () => {
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce(null);

    await expect(
      operatorBlackout({
        venueId: new Types.ObjectId().toString(),
        actor: actor('venue_owner', 'not-the-owner'),
        date: new Date(),
        reason: 'Maintenance',
      })
    ).rejects.toThrow('You do not have access to this venue');
  });
});
