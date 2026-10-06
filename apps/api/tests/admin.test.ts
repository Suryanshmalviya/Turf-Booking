import { describe, expect, it, vi } from 'vitest';

import { AuditLogModel } from '../src/models/admin.model';
import { BookingModel } from '../src/models/bookings.model';
import { VenueModel } from '../src/models/courts.model';
import { AuthSessionModel, UserModel } from '../src/models/users.model';
import {
  searchBookings,
  updateUserRoleOrStatus,
  venueAction,
  venueReviewQueue,
} from '../src/services/admin.service';
import { adminCreateVenueSchema, adminUpdateUserSchema } from '../src/validators/admin.validator';

const emptyPage = () => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
});

describe('admin dashboard queries', () => {
  it('uses safe projections for the approval queue', async () => {
    const find = vi.spyOn(VenueModel, 'find').mockReturnValue(emptyPage() as never);
    vi.spyOn(VenueModel, 'countDocuments').mockResolvedValue(0);

    const result = await venueReviewQueue({ page: 1, limit: 25 });

    expect(result.total).toBe(0);
    expect(result.meta).toMatchObject({ page: 1, limit: 25, total: 0 });
    expect(find).toHaveBeenCalledWith({
      status: { $in: ['draft', 'pending_review', 'rejected', 'suspended'] },
    });
  });

  it('normalises a booking reference filter to upper case and paginates', async () => {
    const find = vi.spyOn(BookingModel, 'find').mockReturnValue(emptyPage() as never);
    vi.spyOn(BookingModel, 'countDocuments').mockResolvedValue(0);

    const result = await searchBookings({ page: 2, limit: 10, reference: 'pb-abc-123' });

    expect(find).toHaveBeenCalledWith({ publicReference: 'PB-ABC-123' });
    expect(result.meta).toMatchObject({ page: 2, limit: 10, total: 0 });
  });

  it('builds a bounded date window when only one bound is supplied', async () => {
    const find = vi.spyOn(BookingModel, 'find').mockReturnValue(emptyPage() as never);
    vi.spyOn(BookingModel, 'countDocuments').mockResolvedValue(0);
    const from = new Date('2026-01-01T00:00:00Z');

    await searchBookings({ page: 1, limit: 5, from });

    expect(find).toHaveBeenCalledWith({ startAt: { $gte: from } });
  });
});

describe('admin actions', () => {
  it('rejects a status change without a reason before any database work', async () => {
    const findByIdAndUpdate = vi.spyOn(VenueModel, 'findByIdAndUpdate');

    await expect(
      venueAction({
        venueId: '507f1f77bcf86cd799439011',
        actorId: '507f1f77bcf86cd799439012',
        requestId: 'request-1',
        status: 'active',
        reason: ' ',
      })
    ).rejects.toThrow('Administrative reason is required');

    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('applies the moderation transition and records an audit entry', async () => {
    vi.spyOn(VenueModel, 'findByIdAndUpdate').mockResolvedValueOnce({
      _id: 'venue-1',
      status: 'suspended',
    } as never);
    const audit = vi.spyOn(AuditLogModel, 'create').mockResolvedValueOnce({} as never);

    await venueAction({
      venueId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      requestId: 'request-1',
      status: 'suspended',
      reason: 'Repeated safety incidents',
    });

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'venue.suspended', requestId: 'request-1' })
    );
  });

  it('revokes active sessions when an account is suspended', async () => {
    const user = {
      _id: 'user-1',
      email: 'a@b.com',
      displayName: 'A',
      role: 'customer',
      status: 'active',
      save: vi.fn(),
    };
    vi.spyOn(UserModel, 'findById').mockResolvedValueOnce(user as never);
    vi.spyOn(AuthSessionModel, 'updateMany').mockResolvedValueOnce({ modifiedCount: 2 } as never);
    const audit = vi.spyOn(AuditLogModel, 'create').mockResolvedValueOnce({} as never);

    const result = await updateUserRoleOrStatus({
      userId: '507f1f77bcf86cd799439011',
      actorId: '507f1f77bcf86cd799439012',
      status: 'suspended',
    });

    expect(result).toMatchObject({ status: 'suspended' });
    expect(user.save).toHaveBeenCalledOnce();
    expect(AuthSessionModel.updateMany).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.update', resourceType: 'User' })
    );
  });

  it('reports a missing user', async () => {
    vi.spyOn(UserModel, 'findById').mockResolvedValueOnce(null);

    await expect(
      updateUserRoleOrStatus({ userId: '507f1f77bcf86cd799439011', actorId: '507f1f77bcf86cd799439012' })
    ).rejects.toThrow('User not found');
  });
});

describe('admin validators', () => {
  it('applies defaults for an administratively created court', () => {
    const parsed = adminCreateVenueSchema.parse({ body: { name: 'Arena', city: 'Pune' } });

    expect(parsed.body).toMatchObject({
      country: 'IN',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      courtName: 'Court 1',
      pricePerHour: 500,
    });
  });

  it('requires a role or status to update', () => {
    const params = { params: { userId: '507f1f77bcf86cd799439011' } };

    expect(adminUpdateUserSchema.safeParse({ ...params, body: {} }).success).toBe(false);
    expect(adminUpdateUserSchema.safeParse({ ...params, body: { role: 'admin' } }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ ...params, body: { role: 'superuser' } }).success).toBe(false);
  });
});