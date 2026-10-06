import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { requireBookingAccess, requireSelf, requireVenueAccess } from '../src/middleware/authorization';
import { BookingModel } from '../src/models/bookings.model';
import { VenueModel } from '../src/models/courts.model';
import { VenueStaffAssignmentModel } from '../src/models/users.model';
import { assertBookingAccess } from '../src/services/bookings.service';
import { assertVenueAccess, hasStaffAssignment, isVenueOwner } from '../src/services/courts.service';
import type { JwtPayload } from '../src/types/auth';
import { ApiError } from '../src/utils/api-error';

const OWNER_ID = new Types.ObjectId().toString();
const STAFF_ID = new Types.ObjectId().toString();
const VENUE_ID = new Types.ObjectId().toString();

const actor = (role: JwtPayload['role'], sub = OWNER_ID): JwtPayload => ({
  sub,
  email: `${role}@example.com`,
  role,
  jti: 'token-id',
});

/** Runs an async middleware and resolves with the error handed to `next`, if any. */
const runMiddleware = (handler: ReturnType<typeof requireVenueAccess>, request: unknown) =>
  new Promise<{ error: unknown; nextCalls: number }>((resolve) => {
    const next = vi.fn((error?: unknown) => resolve({ error, nextCalls: next.mock.calls.length }));
    handler(request as never, {} as never, next as never);
  });

describe('venue authorization', () => {
  it('always grants administrators access without a lookup', async () => {
    const exists = vi.spyOn(VenueModel, 'exists');

    await expect(assertVenueAccess(VENUE_ID, actor('admin'))).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
    exists.mockRestore();
  });

  it('grants the owning account', async () => {
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce({ _id: VENUE_ID } as never);

    await expect(assertVenueAccess(VENUE_ID, actor('venue_owner'))).resolves.toBeUndefined();
  });

  it('denies an owner who does not own the venue', async () => {
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce(null);

    await expect(assertVenueAccess(VENUE_ID, actor('venue_owner'))).rejects.toThrow(
      'You do not have access to this venue'
    );
  });

  it('grants staff only while an active assignment exists', async () => {
    const exists = vi.spyOn(VenueStaffAssignmentModel, 'exists').mockResolvedValue({ _id: 'a' } as never);

    await expect(assertVenueAccess(VENUE_ID, actor('venue_staff', STAFF_ID))).resolves.toBeUndefined();
    expect(exists).toHaveBeenCalledWith({ venueId: VENUE_ID, userId: STAFF_ID, active: true });
    await expect(hasStaffAssignment(VENUE_ID, STAFF_ID)).resolves.toBe(true);

    exists.mockResolvedValueOnce(null);
    await expect(assertVenueAccess(VENUE_ID, actor('venue_staff', STAFF_ID))).rejects.toThrow(
      'You do not have access to this venue'
    );
  });

  it('denies customers and reports ownership state', async () => {
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce(null);

    await expect(isVenueOwner(VENUE_ID, OWNER_ID)).resolves.toBe(false);
    await expect(assertVenueAccess(VENUE_ID, actor('customer'))).rejects.toThrow(
      'You do not have access to this venue'
    );
  });
});

describe('booking authorization', () => {
  const bookingLean = (userId: string) => ({
    _id: 'booking-1',
    select: vi.fn().mockResolvedValue({ userId: { toString: () => userId }, venueId: VENUE_ID }),
  });

  it('denies a customer reading another customer booking', async () => {
    vi.spyOn(BookingModel, 'findById').mockReturnValueOnce(bookingLean('other-user') as never);

    await expect(
      assertBookingAccess(new Types.ObjectId().toString(), actor('customer', 'current-user'))
    ).rejects.toThrow('You do not have access to this booking');
  });

  it('allows a customer to reach their own booking', async () => {
    vi.spyOn(BookingModel, 'findById').mockReturnValueOnce(bookingLean('current-user') as never);

    await expect(
      assertBookingAccess(new Types.ObjectId().toString(), actor('customer', 'current-user'))
    ).resolves.toBeUndefined();
  });

  it('requires venue access before an operator reaches a booking', async () => {
    const bookingId = new Types.ObjectId().toString();
    vi.spyOn(BookingModel, 'findById').mockReturnValueOnce(bookingLean('someone-else') as never);
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce(null);

    await expect(assertBookingAccess(bookingId, actor('venue_owner'))).rejects.toThrow(
      'You do not have access to this booking'
    );
  });

  it('lets an administrator reach any existing booking', async () => {
    const bookingId = new Types.ObjectId().toString();
    vi.spyOn(BookingModel, 'findById').mockReturnValueOnce(bookingLean('someone-else') as never);

    await expect(assertBookingAccess(bookingId, actor('admin'))).resolves.toBeUndefined();
  });
});

describe('authorization middleware adapters', () => {
  it('passes the venue id from the path to the service', async () => {
    vi.spyOn(VenueModel, 'exists').mockResolvedValueOnce({ _id: VENUE_ID } as never);

    const { error, nextCalls } = await runMiddleware(requireVenueAccess(), {
      params: { venueId: VENUE_ID },
      user: actor('venue_owner'),
    });

    expect(error).toBeUndefined();
    expect(nextCalls).toBe(1);
  });

  it('surfaces service rejections to the error pipeline', async () => {
    vi.spyOn(BookingModel, 'findById').mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ userId: { toString: () => 'someone-else' }, venueId: VENUE_ID }),
    } as never);

    const { error } = await runMiddleware(requireBookingAccess(), {
      params: { bookingId: new Types.ObjectId().toString() },
      user: actor('customer', new Types.ObjectId().toString()),
    });

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('You do not have access to this booking');
    expect((error as ApiError).statusCode).toBe(403);
  });

  it('requires an authenticated subject', async () => {
    const { error } = await runMiddleware(requireVenueAccess(), { params: { venueId: VENUE_ID } });

    expect((error as ApiError).message).toBe('Authentication required');
    expect((error as ApiError).statusCode).toBe(401);
  });

  it('rejects a request without a resolvable id', async () => {
    const { error } = await runMiddleware(requireVenueAccess(), { params: {}, user: actor('admin') });

    expect((error as ApiError).statusCode).toBe(400);
  });

  it('restricts self-service routes to the token subject', () => {
    const denied = vi.fn();
    const allowed = vi.fn();

    requireSelf()({ params: { userId: 'other' }, user: actor('customer', 'me') } as never, {} as never, denied as never);
    expect((denied.mock.calls[0][0] as ApiError).statusCode).toBe(403);

    requireSelf()({ params: { userId: 'me' }, user: actor('customer', 'me') } as never, {} as never, allowed as never);
    expect(allowed).toHaveBeenCalledWith();
  });
});