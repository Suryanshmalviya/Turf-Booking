import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { config } from '../src/config';
import { AuthSessionModel, AuthTokenModel, UserModel } from '../src/models/auth.model';
import { NotificationModel } from '../src/models/notifications.model';
import {
  type AuthMailKind,
  clearRecentAuthMails,
  recentAuthMails,
  registerAuthMailTransport,
  resetAuthMailTransports,
} from '../src/services/auth-mail.service';
import { hashAuthToken } from '../src/services/auth-token.service';
import type { UserRole } from '../src/types/enums';
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/test-db';

/**
 * End-to-end authentication coverage against a real MongoDB: password hashing,
 * cookie handling, token rotation and role authorization are all exercised
 * through the Express stack rather than through mocks.
 */

const PASSWORD = 'Str0ngPassphrase';
const NEW_PASSWORD = 'An0therPassphrase';
const EMAIL = 'player@example.com';

type CookieJar = Record<string, string>;

interface Session {
  cookies: CookieJar;
  userId: string;
}

/** Parses `Set-Cookie` headers into a name -> value map. */
function cookieJarFrom(response: request.Response): CookieJar {
  const raw = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const jar: CookieJar = {};

  for (const cookie of raw) {
    const [pair = ''] = cookie.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) jar[pair.slice(0, separator).trim()] = pair.slice(separator + 1);
  }

  return jar;
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/** Applies a session to a request, echoing the CSRF cookie the way the web client does. */
function withSession(session: Session) {
  const csrf = session.cookies[config.auth.csrfCookieName];
  return (target: request.Test): request.Test => {
    target.set('Cookie', cookieHeader(session.cookies));
    if (csrf) target.set(config.auth.csrfHeaderName, csrf);
    return target;
  };
}

function accessTokenHeader(token: string) {
  return (target: request.Test): request.Test => target.set('Authorization', `Bearer ${token}`);
}

function signAccessToken(role: UserRole, subject = new Types.ObjectId().toString()): string {
  return jwt.sign(
    { sub: subject, email: `${role}@example.com`, role, jti: randomUUID() },
    config.jwt.secret,
    {
      expiresIn: '5m',
    }
  );
}

/** Pulls the opaque token out of the most recently issued authentication email. */
function latestToken(kind: AuthMailKind): string {
  const mail = recentAuthMails(kind).at(-1);
  if (!mail) throw new Error(`No ${kind} email was issued`);
  const token = new URL(mail.link).searchParams.get('token');
  if (!token) throw new Error(`${kind} email did not contain a token`);
  return token;
}

async function createUser(overrides: Partial<Record<string, unknown>> = {}) {
  const passwordHash = await bcrypt.hash(overrides.password as string, config.bcrypt.rounds);
  return UserModel.create({
    email: EMAIL,
    displayName: 'Test Player',
    role: 'customer',
    status: 'active',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    passwordHash,
    ...overrides,
  });
}

/** Registers through the API and returns the resulting session. */
async function register(overrides: Record<string, unknown> = {}): Promise<Session> {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: EMAIL, password: PASSWORD, displayName: 'Test Player', ...overrides });

  if (response.status !== 201)
    throw new Error(`Registration failed: ${JSON.stringify(response.body)}`);

  return { cookies: cookieJarFrom(response), userId: response.body.data.user.id };
}

/** Signs a verified account in and returns its session. */
async function login(
  email = EMAIL,
  password = PASSWORD
): Promise<{ status: number; session: Session; body: unknown }> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  return {
    status: response.status,
    session: { cookies: cookieJarFrom(response), userId: '' },
    body: response.body,
  };
}

beforeAll(async () => {
  // A deliberately low cost keeps the suite fast; production uses BCRYPT_ROUNDS=12.
  config.bcrypt.rounds = 4;
  await startTestDatabase();
});

afterAll(stopTestDatabase);

beforeEach(async () => {
  await resetTestDatabase();
  resetAuthMailTransports();
  clearRecentAuthMails();
});

describe('registration', () => {
  it('creates the account, stores only a bcrypt hash and never returns credentials', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Test Player' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const { user } = response.body.data;
    expect(user).toMatchObject({ email: EMAIL, role: 'customer', emailVerified: false });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(response.body)).not.toContain(config.jwt.secret);

    const stored = await UserModel.findOne({ email: EMAIL }).select('+passwordHash');
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toBe(PASSWORD);
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare(PASSWORD, stored!.passwordHash)).resolves.toBe(true);
  });

  it('issues HttpOnly session cookies and no token in the body', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Test Player' });

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const access = cookies.find(cookie => cookie.startsWith(`${config.auth.accessCookieName}=`));
    const refresh = cookies.find(cookie => cookie.startsWith(`${config.auth.refreshCookieName}=`));
    const csrf = cookies.find(cookie => cookie.startsWith(`${config.auth.csrfCookieName}=`));

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(csrf).toBeDefined();
    // The CSRF cookie must stay readable so the client can echo it in a header.
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(JSON.stringify(response.body)).not.toContain(
      cookieJarFrom(response)[config.auth.accessCookieName]
    );
  });

  it('stores the refresh session hashed, never in the clear', async () => {
    const session = await register();

    const stored = await AuthSessionModel.findOne({ userId: session.userId }).select(
      '+refreshTokenHash'
    );
    expect(stored).not.toBeNull();

    const presented = session.cookies[config.auth.refreshCookieName];
    expect(stored!.refreshTokenHash).not.toBe(presented);
    expect(stored!.refreshTokenHash).toHaveLength(64);
  });

  it('sends a verification email and keeps the link out of the database', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Test Player' });

    const token = latestToken('email_verification');
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const stored = await AuthTokenModel.findOne({ purpose: 'email_verification' }).select(
      '+tokenHash'
    );
    expect(stored!.tokenHash).toBe(hashAuthToken(token));
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.consumedAt).toBeUndefined();

    const inbox = await NotificationModel.findOne({ type: 'email_verification' });
    expect(inbox).not.toBeNull();
    expect(inbox!.body).not.toContain(token);

    expect(response.body.data.user.emailVerified).toBe(false);
  });

  it('rejects a duplicate email without creating a second account', async () => {
    await register();

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Someone Else' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    await expect(UserModel.countDocuments({ email: EMAIL })).resolves.toBe(1);
  });

  it('validates the payload before touching the database', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'body.email' }),
        expect.objectContaining({ field: 'body.password' }),
      ])
    );
    await expect(UserModel.countDocuments({})).resolves.toBe(0);
  });
});

describe('login', () => {
  it('signs in a verified account and records the session', async () => {
    const user = await createUser({ password: PASSWORD });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: user._id.toString(), role: 'customer' });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');

    const jar = cookieJarFrom(response);
    expect(jar[config.auth.accessCookieName]).toBeTruthy();
    expect(jar[config.auth.refreshCookieName]).toBeTruthy();

    await expect(
      UserModel.findById(user._id).then(doc => doc!.lastLoginAt)
    ).resolves.toBeInstanceOf(Date);
    await expect(AuthSessionModel.countDocuments({ userId: user._id })).resolves.toBe(1);
  });

  it('rejects a wrong password with a generic error and sets no cookie', async () => {
    await createUser({ password: PASSWORD });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'Wr0ngPassphrase' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe('Invalid email or password');
    expect(response.body.error.message).not.toContain(EMAIL);
    expect(response.headers['set-cookie']).toBeUndefined();
    await expect(AuthSessionModel.countDocuments({})).resolves.toBe(0);
  });

  it('gives an unknown email the identical answer as a wrong password', async () => {
    await createUser({ password: PASSWORD });

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'Wr0ngPassphrase' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'Wr0ngPassphrase' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('refuses an unverified account until the address is confirmed', async () => {
    await createUser({ password: PASSWORD, emailVerified: false });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.error.message).toContain('not verified');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a suspended account', async () => {
    await createUser({ password: PASSWORD, status: 'suspended' });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('logout', () => {
  it('revokes the session, clears cookies and stops the refresh token working', async () => {
    await createUser({ password: PASSWORD });
    const { session } = await login();
    const refreshToken = session.cookies[config.auth.refreshCookieName];

    const response = await withSession(session)(request(app).post('/api/v1/auth/logout'));

    expect(response.status).toBe(204);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(cookie => cookie.startsWith(`${config.auth.refreshCookieName}=;`))).toBe(
      true
    );
    expect(cookies.some(cookie => cookie.startsWith(`${config.auth.accessCookieName}=;`))).toBe(
      true
    );

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=${refreshToken}`
      )
      .set(config.auth.csrfHeaderName, 'x');

    expect(refresh.status).toBe(401);
    await expect(AuthSessionModel.countDocuments({ revokedAt: { $exists: false } })).resolves.toBe(
      0
    );
  });

  it('requires the CSRF header when it is driven by cookies', async () => {
    await createUser({ password: PASSWORD });
    const { session } = await login();

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(session.cookies));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('refresh token rotation', () => {
  it('issues a new pair and refuses the previous refresh token', async () => {
    await createUser({ password: PASSWORD });
    const { session } = await login();
    const originalRefresh = session.cookies[config.auth.refreshCookieName];

    const rotated = await withSession(session)(request(app).post('/api/v1/auth/refresh'));
    expect(rotated.status).toBe(200);

    const jar = cookieJarFrom(rotated);
    expect(jar[config.auth.refreshCookieName]).toBeTruthy();
    expect(jar[config.auth.refreshCookieName]).not.toBe(originalRefresh);
    expect(jar[config.auth.accessCookieName]).toBeTruthy();

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=${originalRefresh}`
      )
      .set(config.auth.csrfHeaderName, 'x');

    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toBe('Refresh session expired or revoked');
  });

  it('rejects a missing, malformed or foreign-secret refresh token', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${config.auth.csrfCookieName}=x`)
      .set(config.auth.csrfHeaderName, 'x');
    expect(missing.status).toBe(401);
    expect(missing.body.error.message).toBe('Refresh session required');

    const malformed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=not-a-jwt`)
      .set(config.auth.csrfHeaderName, 'x');
    expect(malformed.status).toBe(401);

    // A refresh-shaped token signed with the *access* secret must not be accepted.
    const wrongSecret = jwt.sign(
      { sub: new Types.ObjectId().toString(), jti: randomUUID(), type: 'refresh' },
      config.jwt.secret,
      { expiresIn: '5m' }
    );
    const foreign = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=${wrongSecret}`
      )
      .set(config.auth.csrfHeaderName, 'x');
    expect(foreign.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    await createUser({ password: PASSWORD });
    const expired = jwt.sign(
      { sub: new Types.ObjectId().toString(), jti: randomUUID(), type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: '-1s' }
    );

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=${expired}`)
      .set(config.auth.csrfHeaderName, 'x');

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Refresh session expired or invalid');
  });
});

describe('access token failures', () => {
  it('reports an expired access session', async () => {
    const expired = jwt.sign(
      {
        sub: new Types.ObjectId().toString(),
        email: EMAIL,
        role: 'customer',
        jti: randomUUID(),
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      config.jwt.secret
    );

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${config.auth.accessCookieName}=${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Access session expired');
  });

  it('reports a malformed or wrongly signed access token', async () => {
    const malformed = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${config.auth.accessCookieName}=not-a-jwt`);
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.message).toBe('Invalid authentication session');

    const wrongSecret = jwt.sign(
      { sub: new Types.ObjectId().toString(), email: EMAIL, role: 'admin', jti: randomUUID() },
      'z'.repeat(32),
      { expiresIn: '5m' }
    );
    const forged = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${wrongSecret}`);
    expect(forged.status).toBe(401);
    expect(forged.body.error.message).toBe('Invalid authentication session');
  });

  it('demands a session on the current-user endpoint', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication required');
  });
});

describe('current user and profile', () => {
  it('returns the safe projection for a signed-in user', async () => {
    const user = await createUser({ password: PASSWORD });
    const { session } = await login();

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set(
        'Cookie',
        `${config.auth.accessCookieName}=${session.cookies[config.auth.accessCookieName]}`
      );

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      id: user._id.toString(),
      email: EMAIL,
      role: 'customer',
      emailVerified: true,
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');

    const profile = await accessTokenHeader(session.cookies[config.auth.accessCookieName])(
      request(app).get('/api/v1/users/me')
    );
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).not.toContain(PASSWORD);
  });

  it('refuses the profile endpoint without a session', async () => {
    const response = await request(app).get('/api/v1/users/me');

    expect(response.status).toBe(401);
  });
});

describe('email verification', () => {
  it('activates the account with the emailed token', async () => {
    const session = await register();

    const denied = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(denied.status).toBe(403);

    const response = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: latestToken('email_verification') });

    expect(response.status).toBe(200);
    expect(response.body.data.emailVerified).toBe(true);

    const stored = await UserModel.findOne({ email: EMAIL });
    expect(stored!.emailVerified).toBe(true);
    expect(stored!.emailVerifiedAt).toBeInstanceOf(Date);

    const allowed = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(allowed.status).toBe(200);
    expect(session.userId).toBe(stored!._id.toString());
  });

  it('burns the token so the link cannot be replayed', async () => {
    await register();
    const token = latestToken('email_verification');

    const first = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(first.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('rejects an unknown token, a foreign-purpose token and malformed input', async () => {
    await register();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const recoveryToken = latestToken('password_reset');

    const unknown = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'a'.repeat(64) });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('AUTH_TOKEN_INVALID');

    const wrongPurpose = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: recoveryToken });
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.error.code).toBe('AUTH_TOKEN_INVALID');

    const malformed = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'short-token' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an expired verification token', async () => {
    const session = await register();
    await AuthTokenModel.updateMany(
      { userId: session.userId },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    );

    const response = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: latestToken('email_verification') });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('re-issues a link on request and invalidates the previous one', async () => {
    const session = await register();
    const firstToken = latestToken('email_verification');

    const resent = await withSession(session)(
      request(app).post('/api/v1/auth/resend-verification')
    );
    expect(resent.status).toBe(202);

    const secondToken = latestToken('email_verification');
    expect(secondToken).not.toBe(firstToken);

    const stale = await request(app).post('/api/v1/auth/verify-email').send({ token: firstToken });
    expect(stale.status).toBe(400);
    expect(stale.body.error.code).toBe('AUTH_TOKEN_INVALID');

    const fresh = await request(app).post('/api/v1/auth/verify-email').send({ token: secondToken });
    expect(fresh.status).toBe(200);
  });

  it('reports an already verified address without sending another email', async () => {
    const user = await createUser({ password: PASSWORD });
    const { session } = await login();

    const response = await withSession(session)(
      request(app).post('/api/v1/auth/resend-verification')
    );

    expect(response.status).toBe(200);
    expect(response.body.data.emailVerified).toBe(true);
    expect(recentAuthMails('email_verification')).toHaveLength(0);
    expect(user.emailVerified).toBe(true);
  });

  it('routes the resend link to a registered transport', async () => {
    const delivered: string[] = [];
    registerAuthMailTransport('email_verification', async mail => {
      delivered.push(mail.recipient);
    });

    const session = await register();
    delivered.length = 0;

    const response = await withSession(session)(
      request(app).post('/api/v1/auth/resend-verification')
    );

    expect(response.status).toBe(202);
    expect(delivered).toEqual([EMAIL]);
  });
});

describe('forgot password', () => {
  it('acknowledges an unknown address identically and issues nothing', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(unknown.status).toBe(202);
    await expect(AuthTokenModel.countDocuments({})).resolves.toBe(0);
    expect(recentAuthMails('password_reset')).toHaveLength(0);

    await createUser({ password: PASSWORD });
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });

    expect(known.status).toBe(202);
    expect(known.body.data.message).toBe(unknown.body.data.message);
    expect(JSON.stringify(known.body)).not.toContain('token');
  });

  it('stores the recovery link hashed and keeps it out of the inbox record', async () => {
    const user = await createUser({ password: PASSWORD });

    const response = await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    expect(response.status).toBe(202);

    const token = latestToken('password_reset');
    const stored = await AuthTokenModel.findOne({
      userId: user._id,
      purpose: 'password_reset',
    }).select('+tokenHash');
    expect(stored!.tokenHash).toBe(hashAuthToken(token));
    expect(stored!.tokenHash).not.toBe(token);

    const inbox = await NotificationModel.findOne({ type: 'password_reset' });
    expect(inbox!.body).not.toContain(token);
    expect(await NotificationModel.countDocuments({ body: token })).toBe(0);
  });

  it('invalidates an earlier recovery link when a new one is requested', async () => {
    await createUser({ password: PASSWORD });

    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const stale = latestToken('password_reset');

    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const fresh = latestToken('password_reset');
    expect(fresh).not.toBe(stale);

    const staleAttempt = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: stale, password: NEW_PASSWORD });
    expect(staleAttempt.status).toBe(400);
    expect(staleAttempt.body.error.code).toBe('AUTH_TOKEN_INVALID');

    const freshAttempt = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: fresh, password: NEW_PASSWORD });
    expect(freshAttempt.status).toBe(200);
  });

  it('validates the submitted address', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('reset password', () => {
  it('changes the hash, ends every session and accepts the new password', async () => {
    const user = await createUser({ password: PASSWORD });
    const { session } = await login();
    const refreshToken = session.cookies[config.auth.refreshCookieName];
    const previousHash = (await UserModel.findById(user._id).select('+passwordHash'))!.passwordHash;

    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: latestToken('password_reset'), password: NEW_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.revokedSessions).toBeGreaterThanOrEqual(1);

    const updated = await UserModel.findById(user._id).select('+passwordHash');
    expect(updated!.passwordHash).not.toBe(previousHash);
    expect(updated!.passwordHash).not.toBe(NEW_PASSWORD);
    expect(updated!.passwordChangedAt).toBeInstanceOf(Date);
    await expect(bcrypt.compare(NEW_PASSWORD, updated!.passwordHash)).resolves.toBe(true);

    const oldPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: NEW_PASSWORD });
    expect(newPassword.status).toBe(200);

    const staleRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `${config.auth.csrfCookieName}=x; ${config.auth.refreshCookieName}=${refreshToken}`
      )
      .set(config.auth.csrfHeaderName, 'x');
    expect(staleRefresh.status).toBe(401);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(cookie => cookie.startsWith(`${config.auth.accessCookieName}=;`))).toBe(
      true
    );
  });

  it('rejects an expired, replayed or malformed recovery token', async () => {
    await createUser({ password: PASSWORD });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const token = latestToken('password_reset');

    await AuthTokenModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    const expired = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('AUTH_TOKEN_EXPIRED');

    await AuthTokenModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() + 3_600_000) } });
    const malformed = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-token', password: NEW_PASSWORD });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const unknown = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'c'.repeat(64), password: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('refuses a token that was already redeemed', async () => {
    await createUser({ password: PASSWORD });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const token = latestToken('password_reset');

    const first = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Y3tAnotherPassphrase' });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('refuses to set the current password again but keeps the link usable', async () => {
    await createUser({ password: PASSWORD });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const token = latestToken('password_reset');

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('different');

    const stillValid = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(stillValid.status).toBe(200);

    // The rejected attempt must not have burned the recovery link.
    const retry = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    expect(retry.status).toBe(200);
  });

  it('rejects a weak password and a mismatched confirmation', async () => {
    await createUser({ password: PASSWORD });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
    const token = latestToken('password_reset');

    const weak = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const mismatch = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD, confirmPassword: 'Different1Passphrase' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('VALIDATION_ERROR');

    // The rejected attempts must not have consumed the link.
    const accepted = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(accepted.status).toBe(200);
  });
});

describe('role authorization', () => {
  it('keeps a normal user out of the admin surface', async () => {
    await createUser({ password: PASSWORD });
    const { session } = await login();
    const token = session.cookies[config.auth.accessCookieName];

    const directory = await accessTokenHeader(token)(request(app).get('/api/v1/users'));
    expect(directory.status).toBe(403);
    expect(directory.body.error.code).toBe('FORBIDDEN');

    const admin = await accessTokenHeader(token)(request(app).get('/api/v1/admin/users'));
    expect(admin.status).toBe(403);
    expect(admin.body.error.message).toBe('Insufficient permissions');
  });

  it('lets an administrator through without exposing password material', async () => {
    await createUser({ password: PASSWORD });
    const admin = await UserModel.create({
      email: 'admin@example.com',
      displayName: 'Platform Admin',
      passwordHash: await bcrypt.hash(PASSWORD, config.bcrypt.rounds),
      role: 'admin',
      status: 'active',
      emailVerified: true,
    });

    const response = await accessTokenHeader(signAccessToken('admin', admin._id.toString()))(
      request(app).get('/api/v1/admin/users')
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('separates authentication from authorization', async () => {
    const anonymous = await request(app).get('/api/v1/users');
    expect(anonymous.status).toBe(401);

    const user = await createUser({ password: PASSWORD });
    const { session } = await login();

    const ownProfile = await accessTokenHeader(session.cookies[config.auth.accessCookieName])(
      request(app).get(`/api/v1/users/${user._id}`)
    );
    expect(ownProfile.status).toBe(403);
  });
});
