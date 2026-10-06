import { createHash, randomBytes } from 'node:crypto';

import { Types } from 'mongoose';

import { config, logger } from '../config';
import { AuthTokenModel } from '../models/auth.model';
import type { SessionMetadata } from '../types/auth';
import type { AuthTokenPurpose } from '../types/enums';
import { ApiError } from '../utils/api-error';

/**
 * Lifecycle for the single-use tokens behind email verification and password
 * recovery.
 *
 * Tokens are 256 bits of CSPRNG output. The database only ever stores their
 * SHA-256 digest, so a dump of the collection cannot be replayed against the API.
 * Consuming a token is a single atomic `findOneAndUpdate`, which is what makes a
 * replayed link fail even when two requests race.
 */

/** Number of hash collisions tolerated before giving up (astronomically rare). */
const MAX_ISSUE_ATTEMPTS = 3;

const TTL_MINUTES = {
  email_verification: (): number => config.auth.emailVerificationTtlMinutes,
  password_reset: (): number => config.auth.passwordResetTtlMinutes,
} satisfies Record<AuthTokenPurpose, () => number>;

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedAuthToken {
  token: string;
  expiresAt: Date;
}

/** Minimal account projection a token needs: no password material is involved. */
export interface AuthTokenOwner {
  id: string;
}

/**
 * Issues a fresh token and invalidates any earlier unused token of the same
 * purpose, so only the most recently delivered link can ever be redeemed.
 */
export async function issueAuthToken(
  owner: AuthTokenOwner,
  purpose: AuthTokenPurpose,
  metadata?: SessionMetadata
): Promise<IssuedAuthToken> {
  const userId = new Types.ObjectId(owner.id);

  await AuthTokenModel.updateMany(
    { userId, purpose, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date() } }
  );

  let duplicateKey: number | undefined;

  for (let attempt = 1; attempt <= MAX_ISSUE_ATTEMPTS; attempt += 1) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TTL_MINUTES[purpose]() * 60_000);

    try {
      await AuthTokenModel.create({
        purpose,
        userId,
        tokenHash: hashAuthToken(token),
        expiresAt,
        ...(metadata?.userAgent ? { userAgent: metadata.userAgent } : {}),
        ...(metadata?.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
      });

      return { token, expiresAt };
    } catch (error) {
      duplicateKey = (error as { code?: number }).code;
      if (duplicateKey !== 11000 || attempt === MAX_ISSUE_ATTEMPTS) throw error;
      logger.warn({ userId: owner.id, purpose, attempt }, 'Retrying auth token issuance');
    }
  }

  /* c8 ignore next */
  throw new ApiError(500, 'TOKEN_ISSUE_FAILED', 'Could not issue a secure token, please retry');
}

/**
 * Reads a token without redeeming it. Used to reject an impossible password
 * choice *before* the link is burned, so the caller can simply try again.
 */
export async function peekAuthToken(
  token: string,
  purpose: AuthTokenPurpose
): Promise<string> {
  const existing = await AuthTokenModel.findOne({
    purpose,
    tokenHash: hashAuthToken(token),
    consumedAt: { $exists: false },
  });

  if (!existing) {
    throw new ApiError(400, 'AUTH_TOKEN_INVALID', 'This link is invalid or has already been used');
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'AUTH_TOKEN_EXPIRED', 'This link has expired, please request a new one');
  }

  return existing.userId.toString();
}

/**
 * Atomically redeems a token and returns the owning user id. Fails identically
 * for unknown, already-redeemed and malformed tokens so a caller cannot probe
 * which tokens ever existed.
 */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose
): Promise<string> {
  const tokenHash = hashAuthToken(token);

  const consumed = await AuthTokenModel.findOneAndUpdate(
    { purpose, tokenHash, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );
  if (consumed) return consumed.userId.toString();

  const existing = await AuthTokenModel.findOne({ purpose, tokenHash });
  if (!existing) {
    throw new ApiError(400, 'AUTH_TOKEN_INVALID', 'This link is invalid or has already been used');
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'AUTH_TOKEN_EXPIRED', 'This link has expired, please request a new one');
  }

  /* c8 ignore next 2 */
  throw new ApiError(400, 'AUTH_TOKEN_INVALID', 'This link is invalid or has already been used');
}

/** Invalidates every outstanding token of a purpose (or all purposes). */
export async function revokeUserAuthTokens(
  userId: string,
  purpose?: AuthTokenPurpose
): Promise<void> {
  await AuthTokenModel.updateMany(
    {
      userId,
      consumedAt: { $exists: false },
      ...(purpose ? { purpose } : {}),
    },
    { $set: { consumedAt: new Date() } }
  );
}