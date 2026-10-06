import { createHash, randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { config, logger } from '../config';
import { AuthSessionModel, type UserDocument, UserModel } from '../models/auth.model';
import type { AuthResult, RefreshTokenPayload, SessionMetadata } from '../types/auth';
import { DEFAULT_USER_ROLE } from '../types/enums';
import { ApiError } from '../utils/api-error';
import {
  type AuthMailRecipient,
  sendPasswordResetMail,
  sendVerificationMail,
} from './auth-mail.service';
import {
  consumeAuthToken,
  issueAuthToken,
  peekAuthToken,
  revokeUserAuthTokens,
} from './auth-token.service';

export type SafeUser = AuthResult['user'];

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Constant bcrypt cost. Compared against when no account matches so that an
 * unknown email and a wrong password cost the same wall-clock time.
 */
const DUMMY_PASSWORD_HASH = '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';

/** Strips every sensitive field before a user document crosses the API boundary. */
export function toSafeUser(user: UserDocument): SafeUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    ...(user.phone ? { phone: user.phone } : {}),
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified === true,
  };
}

/** Narrows a document to the only fields an authentication email may carry. */
function project(user: UserDocument): AuthMailRecipient {
  return { id: user._id.toString(), email: user.email, displayName: user.displayName };
}

function signAccessToken(user: UserDocument): string {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role, jti: randomUUID() },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] }
  );
}

function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, jti: sessionId, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'],
  });
}

/** Rejects sign-in for an account that has not confirmed its email address. */
function assertEmailVerified(user: UserDocument): void {
  if (config.auth.requireEmailVerification && !user.emailVerified) {
    throw ApiError.forbidden(
      'Email address is not verified. Check your inbox for the verification link.'
    );
  }
}

/** Issues an access/refresh pair and records the session for revocation. */
export async function createSession(
  user: UserDocument,
  metadata?: SessionMetadata
): Promise<AuthResult> {
  const sessionId = randomUUID();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user._id.toString(), sessionId);
  const decoded = jwt.decode(refreshToken) as RefreshTokenPayload & { exp: number };

  await AuthSessionModel.create({
    sessionId,
    userId: user._id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(decoded.exp * 1000),
    ...(metadata?.userAgent ? { userAgent: metadata.userAgent } : {}),
    ...(metadata?.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
  });

  return { user: toSafeUser(user), tokens: { accessToken, refreshToken } };
}

export async function registerUser(
  input: { email: string; password: string; displayName: string; phone?: string },
  metadata?: SessionMetadata
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  if (await UserModel.exists({ email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  // The plaintext password is hashed immediately and never stored, logged or
  // returned; only the bcrypt digest reaches the database.
  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.rounds);
  const mustVerifyEmail = config.auth.requireEmailVerification;

  const user = await UserModel.create({
    email,
    passwordHash,
    displayName: input.displayName,
    ...(input.phone ? { phone: input.phone } : {}),
    role: DEFAULT_USER_ROLE,
    status: 'active',
    emailVerified: !mustVerifyEmail,
    ...(mustVerifyEmail ? {} : { emailVerifiedAt: new Date() }),
  });

  logger.info({ userId: user._id }, 'User registered');

  if (mustVerifyEmail) {
    const { token } = await issueAuthToken(
      { id: user._id.toString() },
      'email_verification',
      metadata
    );
    await sendVerificationMail(project(user), token);
  }

  return createSession(user, metadata);
}

export async function loginUser(
  input: { email: string; password: string },
  metadata?: SessionMetadata
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email, status: { $ne: 'deleted' } }).select(
    '+passwordHash'
  );

  // Always run a comparison to keep the response time uniform for unknown emails.
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await bcrypt.compare(input.password, passwordHash);

  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active');

  assertEmailVerified(user);

  user.lastLoginAt = new Date();
  await user.save();
  logger.info({ userId: user._id }, 'User logged in');

  return createSession(user, metadata);
}

/** Rotates a refresh token: the presented session is revoked and re-issued. */
export async function refreshSession(
  refreshToken: string,
  metadata?: SessionMetadata
): Promise<AuthResult> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw ApiError.unauthorized('Refresh session expired or invalid');
  }
  if (payload.type !== 'refresh' || !payload.jti) {
    throw ApiError.unauthorized('Refresh session expired or invalid');
  }

  const session = await AuthSessionModel.findOne({
    sessionId: payload.jti,
    userId: payload.sub,
    refreshTokenHash: hashToken(refreshToken),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw ApiError.unauthorized('Refresh session expired or revoked');

  session.revokedAt = new Date();
  await session.save();

  const user = await UserModel.findOne({ _id: payload.sub, status: 'active' });
  if (!user) throw ApiError.unauthorized('User account is unavailable');

  assertEmailVerified(user);

  return createSession(user, metadata);
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await AuthSessionModel.updateOne(
    { refreshTokenHash: hashToken(refreshToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await AuthSessionModel.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  return result.modifiedCount;
}

export async function getCurrentUser(userId: string): Promise<SafeUser> {
  const user = await UserModel.findOne({ _id: userId, status: 'active' });
  if (!user) throw ApiError.unauthorized('User account is unavailable');
  return toSafeUser(user);
}

/**
 * Starts password recovery for an email address.
 *
 * Always resolves, whether or not the account exists, so the endpoint cannot be
 * used to enumerate registered addresses. A fresh token invalidates any earlier
 * unused recovery link.
 */
export async function requestPasswordReset(
  email: string,
  metadata?: SessionMetadata
): Promise<void> {
  const normalisedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne(
    { email: normalisedEmail, status: { $in: ['active', 'suspended'] } },
    '_id email displayName'
  );

  if (!user) {
    logger.info(
      { email: maskEmail(normalisedEmail) },
      'Password reset requested for unknown account'
    );
    return;
  }

  const { token } = await issueAuthToken({ id: user._id.toString() }, 'password_reset', metadata);
  await sendPasswordResetMail(project(user), token);

  logger.info({ userId: user._id }, 'Password reset link issued');
}

/**
 * Redeems a recovery link. Every live session is revoked afterwards, so a stolen
 * device cannot keep its access once the real owner recovers the account.
 */
export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
}): Promise<{ revokedSessions: number }> {
  // Validate the new password before redeeming the link: a rejected choice must
  // not cost the user their recovery link.
  const candidateId = await peekAuthToken(input.token, 'password_reset');
  const candidate = await UserModel.findOne({ _id: candidateId, status: 'active' }).select(
    '+passwordHash'
  );
  if (!candidate) throw ApiError.badRequest('This account is no longer available');
  if (await bcrypt.compare(input.password, candidate.passwordHash)) {
    throw ApiError.badRequest('New password must be different from the current password');
  }

  const userId = await consumeAuthToken(input.token, 'password_reset');

  const user = await UserModel.findOne({ _id: userId, status: 'active' }).select('+passwordHash');
  if (!user) throw ApiError.badRequest('This account is no longer available');

  user.passwordHash = await bcrypt.hash(input.password, config.bcrypt.rounds);
  user.passwordChangedAt = new Date();
  await user.save();

  // A reset also invalidates outstanding recovery and verification links.
  await revokeUserAuthTokens(userId);
  const revokedSessions = await revokeAllSessions(userId);

  logger.info({ userId, revoked: revokedSessions }, 'Password reset completed');
  return { revokedSessions };
}

/** Confirms an email address from a verification link. Idempotent by design. */
export async function confirmEmailAddress(token: string): Promise<{ userId: string }> {
  const userId = await consumeAuthToken(token, 'email_verification');

  const user = await UserModel.findOne({ _id: userId, status: { $ne: 'deleted' } });
  if (!user) throw ApiError.badRequest('This account is no longer available');

  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    logger.info({ userId }, 'Email address verified');
  }

  return { userId };
}

export interface ResendVerificationResult {
  alreadyVerified: boolean;
}

/** Re-issues a verification link for a signed-in, unverified account. */
export async function resendEmailVerification(
  userId: string,
  metadata?: SessionMetadata
): Promise<ResendVerificationResult> {
  const user = await UserModel.findOne({ _id: userId, status: { $ne: 'deleted' } });
  if (!user) throw ApiError.unauthorized('User account is unavailable');

  if (user.emailVerified) return { alreadyVerified: true };

  const { token } = await issueAuthToken({ id: userId }, 'email_verification', metadata);
  await sendVerificationMail(project(user), token);

  logger.info({ userId }, 'Verification link re-issued');
  return { alreadyVerified: false };
}

/** Keeps identifiers out of logs while staying correlatable per user. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
