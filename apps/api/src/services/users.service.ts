import bcrypt from 'bcryptjs';
import type { FilterQuery, Types } from 'mongoose';

import { config, logger } from '../config';
import {
  type AuthSessionDocument,
  AuthSessionModel,
  type UserDocument,
  UserModel,
  VenueStaffAssignmentModel,
} from '../models/users.model';
import type { UserRole, UserStatus } from '../types/enums';
import type { PaginationMeta, SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginateWithMeta } from '../utils/paginate';
import { containsRegex } from '../utils/query';
import { parseSort, type SortWhitelist } from '../utils/sort';
import { revokeAllSessions, type SafeUser, toSafeUser } from './auth.service';

const USER_SORT_WHITELIST: SortWhitelist = {
  createdAt: 1,
  updatedAt: 1,
  email: 1,
  displayName: 1,
  lastLoginAt: 1,
};

const USER_SORT_FALLBACK: SortSpec = { createdAt: -1 };

export interface UserListQuery {
  page: number;
  limit: number;
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  sort?: string;
}

export interface SessionView {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  isCurrent: boolean;
}

type LeanSession = Pick<
  AuthSessionDocument,
  'sessionId' | 'userId' | 'userAgent' | 'ipAddress' | 'expiresAt' | 'revokedAt'
> & { createdAt: Date };

export async function getProfile(userId: string): Promise<SafeUser> {
  const user = await UserModel.findOne({ _id: userId, status: { $ne: 'deleted' } });
  if (!user) throw ApiError.notFound('User');
  return toSafeUser(user);
}

export async function updateProfile(
  userId: string,
  input: { displayName?: string; phone?: string }
): Promise<SafeUser> {
  const user = await UserModel.findOne({ _id: userId, status: { $ne: 'deleted' } });
  if (!user) throw ApiError.notFound('User');

  if (input.displayName !== undefined) user.displayName = input.displayName;
  if (input.phone !== undefined) user.phone = input.phone;

  await user.save();
  logger.info({ userId }, 'User profile updated');
  return toSafeUser(user);
}

/**
 * Changes the password hash and revokes every other session so other devices
 * must sign in again. The session that initiated the change is preserved when
 * its id is supplied.
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  keepSessionId?: string
): Promise<{ revokedSessions: number }> {
  const user = await UserModel.findOne({ _id: userId, status: 'active' }).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
    throw ApiError.badRequest('New password must be different from the current password');
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, config.bcrypt.rounds);
  user.passwordChangedAt = new Date();
  await user.save();

  const result = keepSessionId
    ? await AuthSessionModel.updateMany(
        { userId, revokedAt: { $exists: false }, sessionId: { $ne: keepSessionId } },
        { $set: { revokedAt: new Date() } }
      )
    : { modifiedCount: await revokeAllSessions(userId) };

  logger.info({ userId, revoked: result.modifiedCount }, 'User password changed');
  return { revokedSessions: result.modifiedCount };
}

export async function listSessions(
  userId: string,
  page: number,
  limit: number,
  currentSessionId?: string
): Promise<{ items: SessionView[]; meta: PaginationMeta }> {
  const filter: FilterQuery<AuthSessionDocument> = {
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  };

  const { items, meta } = await paginateWithMeta<AuthSessionDocument, LeanSession>(
    AuthSessionModel,
    filter,
    { page, limit, sort: { createdAt: -1 } }
  );

  return {
    items: items.map(session => ({
      id: session.sessionId,
      ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      ...(session.ipAddress ? { ipAddress: session.ipAddress } : {}),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ...(session.revokedAt ? { revokedAt: session.revokedAt } : {}),
      isCurrent: session.sessionId === currentSessionId,
    })),
    meta,
  };
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<void> {
  const result = await AuthSessionModel.updateOne(
    { userId, sessionId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw ApiError.notFound('Session');
}

/** Paginated, filterable and sortable user directory (administrator use). */
export async function listUsers(input: UserListQuery): Promise<{
  items: unknown[];
  meta: PaginationMeta;
}> {
  const filter: FilterQuery<UserDocument> = { status: { $ne: 'deleted' } };
  if (input.q) {
    const pattern = containsRegex(input.q);
    filter['$or'] = [{ email: pattern }, { displayName: pattern }];
  }
  if (input.role) filter['role'] = input.role;
  if (input.status) filter['status'] = input.status;

  const { items, meta } = await paginateWithMeta<UserDocument>(UserModel, filter, {
    page: input.page,
    limit: input.limit,
    sort: parseSort(input.sort, USER_SORT_WHITELIST, USER_SORT_FALLBACK),
    select: 'email displayName role status phone createdAt lastLoginAt',
  });

  return { items, meta };
}

export async function findUserById(userId: string): Promise<SafeUser> {
  return getProfile(userId);
}

export async function getVenueAssignments(
  userId: string
): Promise<Array<{ _id: Types.ObjectId; venueId: Types.ObjectId; active: boolean }>> {
  return VenueStaffAssignmentModel.find({ userId, active: true })
    .select('venueId active')
    .sort({ createdAt: 1 })
    .lean()
    .then(rows => rows.map(row => ({ _id: row._id, venueId: row.venueId, active: row.active })));
}
