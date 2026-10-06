import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/app';
import { config } from '../src/config';
import { requireCsrf } from '../src/middleware/auth.middleware';
import {
  authorize,
  requireAdmin,
  requireAdminOr,
  requireSelfOrAdmin,
  requireUser,
} from '../src/middleware/role.middleware';
import { ApiError } from '../src/utils/api-error';

const authService = vi.hoisted(() => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  refreshSession: vi.fn(),
  revokeSession: vi.fn(),
  getCurrentUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  confirmEmailAddress: vi.fn(),
  resendEmailVerification: vi.fn(),
}));

vi.mock('../src/services/auth.service', () => authService);

describe('authentication endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs in without returning a token or password hash', async () => {
    authService.loginUser.mockResolvedValue({
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        displayName: 'User',
        role: 'customer',
        status: 'active',
      },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'correct horse battery staple' });

    expect(response.status).toBe(200);
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body.data).not.toHaveProperty('tokens');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(
      cookies.some(cookie => cookie.startsWith('pb_access=') && cookie.includes('HttpOnly'))
    ).toBe(true);
    expect(cookies.some(cookie => cookie.startsWith('pb_csrf='))).toBe(true);
  });

  it('registers customers only and returns a safe current-user projection', async () => {
    authService.registerUser.mockResolvedValue({
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'new@example.com',
        displayName: 'New User',
        role: 'customer',
        status: 'active',
      },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'new@example.com', password: 'Str0ngPassphrase', displayName: 'New User' });

    expect(response.status).toBe(201);
    expect(authService.registerUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
      expect.anything()
    );
    expect(response.body.data.user.role).toBe('customer');
  });

  it('rejects malformed registration payloads with field details', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(authService.registerUser).not.toHaveBeenCalled();
  });

  it('returns a safe error for invalid credentials', async () => {
    authService.loginUser.mockRejectedValue(ApiError.unauthorized('Invalid email or password'));

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'wrong password value' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('revokes a refresh session and clears cookies on logout', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', ['pb_refresh=refresh-token', 'pb_csrf=csrf-token'])
      .set('x-csrf-token', 'csrf-token');

    expect(response.status).toBe(204);
    expect(authService.revokeSession).toHaveBeenCalledWith('refresh-token');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(cookie => cookie.startsWith('pb_refresh=;'))).toBe(true);
  });

  it('rejects cookie-authenticated state changes without a matching CSRF token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', ['pb_refresh=refresh-token', 'pb_csrf=csrf-token']);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(authService.revokeSession).not.toHaveBeenCalled();
  });

  it('rejects an expired access session', async () => {
    const token = jwt.sign(
      {
        sub: 'user-id',
        email: 'user@example.com',
        role: 'customer',
        jti: 'token-id',
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      config.jwt.secret
    );

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`${config.auth.accessCookieName}=${token}`]);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Access session expired');
  });

  it('rejects a refresh without a CSRF token even when a session cookie is present', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['pb_refresh=refresh-token']);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(authService.refreshSession).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated refresh without a session cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['pb_csrf=csrf-token'])
      .set('x-csrf-token', 'csrf-token');

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Refresh session required');
  });
});

describe('password recovery endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acknowledges a recovery request without revealing anything', async () => {
    authService.requestPasswordReset.mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(response.status).toBe(202);
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'user@example.com',
      expect.anything()
    );
    expect(JSON.stringify(response.body)).not.toContain('@');
  });

  it('validates the recovery request body', async () => {
    const response = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('clears the session cookies after a successful reset', async () => {
    authService.resetPasswordWithToken.mockResolvedValue({ revokedSessions: 3 });

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'Str0ngPassphrase' });

    expect(response.status).toBe(200);
    expect(response.body.data.revokedSessions).toBe(3);
    expect(JSON.stringify(response.body)).not.toContain('Str0ngPassphrase');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(cookie => cookie.startsWith('pb_access=;'))).toBe(true);
  });

  it('surfaces a safe message for an expired recovery token', async () => {
    authService.resetPasswordWithToken.mockRejectedValue(
      new ApiError(400, 'AUTH_TOKEN_EXPIRED', 'This link has expired, please request a new one')
    );

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'b'.repeat(64), password: 'Str0ngPassphrase' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    expect(response.body.error.message).not.toContain('tokenHash');
  });
});

describe('email verification endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms an address from a token', async () => {
    authService.confirmEmailAddress.mockResolvedValue({ userId: 'user-id' });

    const response = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'c'.repeat(64) });

    expect(response.status).toBe(200);
    expect(response.body.data.emailVerified).toBe(true);
    expect(authService.confirmEmailAddress).toHaveBeenCalledWith('c'.repeat(64));
  });

  it('rejects a token that could not have been issued by the API', async () => {
    const response = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: '../../etc/passwd' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.confirmEmailAddress).not.toHaveBeenCalled();
  });

  it('requires a session before re-sending a verification link', async () => {
    const response = await request(app).post('/api/v1/auth/resend-verification');

    expect(response.status).toBe(401);
    expect(authService.resendEmailVerification).not.toHaveBeenCalled();
  });

  it('tells an already verified caller that nothing was sent', async () => {
    authService.resendEmailVerification.mockResolvedValue({ alreadyVerified: true });
    const token = jwt.sign(
      { sub: 'user-id', email: 'user@example.com', role: 'customer', jti: 'token-id' },
      config.jwt.secret,
      { expiresIn: '5m' }
    );

    const response = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Cookie', [`pb_access=${token}`, 'pb_csrf=csrf-token'])
      .set('x-csrf-token', 'csrf-token');

    expect(response.status).toBe(200);
    expect(response.body.data.emailVerified).toBe(true);
  });

  it('does not send a new link to an authenticated caller without the CSRF header', async () => {
    authService.resendEmailVerification.mockResolvedValue({ alreadyVerified: false });
    const token = jwt.sign(
      { sub: 'user-id', email: 'user@example.com', role: 'customer', jti: 'token-id' },
      config.jwt.secret,
      { expiresIn: '5m' }
    );

    const response = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Cookie', [`pb_access=${token}`, 'pb_csrf=csrf-token']);

    expect(response.status).toBe(403);
    expect(authService.resendEmailVerification).not.toHaveBeenCalled();
  });
});

describe('role-based authorization middleware', () => {
  const customerRequest = {
    user: { sub: 'user-id', email: 'user@example.com', role: 'customer', jti: 'token-id' },
  } as never;
  const adminRequest = {
    user: { sub: 'admin-id', email: 'admin@example.com', role: 'admin', jti: 'token-id' },
  } as never;

  it('allows only declared roles', () => {
    const allowed = vi.fn();
    const denied = vi.fn();

    authorize('customer')(customerRequest, {} as never, allowed);
    expect(allowed).toHaveBeenCalledOnce();

    authorize('admin')(customerRequest, {} as never, denied);
    expect(denied.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect((denied.mock.calls[0][0] as ApiError).message).toBe('Insufficient permissions');
  });

  it('requires authentication before evaluating roles', () => {
    const next = vi.fn();
    authorize('customer')({} as never, {} as never, next);

    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(401);
  });

  it('routes role failures into the error pipeline instead of throwing', () => {
    const next = vi.fn();
    authorize('admin')(customerRequest, {} as never, next as never);

    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });

  it('lets any authenticated principal through the user tier', () => {
    const allowed = vi.fn();
    requireUser()(customerRequest, {} as never, allowed);
    expect(allowed).toHaveBeenCalledOnce();

    const denied = vi.fn();
    requireUser()({} as never, {} as never, denied);
    expect((denied.mock.calls[0][0] as ApiError).statusCode).toBe(401);
  });

  it('restricts the admin tier to administrators', () => {
    const allowed = vi.fn();
    requireAdmin()(adminRequest, {} as never, allowed);
    expect(allowed).toHaveBeenCalledOnce();

    const denied = vi.fn();
    requireAdmin()(customerRequest, {} as never, denied);
    expect((denied.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });

  it('combines admin access with explicitly allowed roles', () => {
    const allowed = vi.fn();
    const denied = vi.fn();

    requireAdminOr('venue_owner')(adminRequest, {} as never, allowed);
    requireAdminOr('venue_owner')(customerRequest, {} as never, denied);

    expect(allowed).toHaveBeenCalledOnce();
    expect((denied.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });

  it('permits a self-service route only for the owner or an administrator', () => {
    const owner = { params: { userId: 'me' }, user: { sub: 'me', role: 'customer' } } as never;
    const other = { params: { userId: 'someone-else' }, user: { sub: 'me', role: 'customer' } } as never;

    const allowed = vi.fn();
    const denied = vi.fn();
    requireSelfOrAdmin()(owner, {} as never, allowed);
    requireSelfOrAdmin()(other, {} as never, denied);
    requireSelfOrAdmin()({ params: { userId: 'me' }, user: { sub: 'admin', role: 'admin' } } as never, {} as never, allowed);

    expect(allowed).toHaveBeenCalledTimes(2);
    expect((denied.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });
});

describe('CSRF middleware', () => {
  it('validates the double-submit token for unsafe methods', () => {
    const next = vi.fn();

    requireCsrf(
      { method: 'POST', cookies: { pb_csrf: 'one' }, header: () => 'two' } as never,
      {} as never,
      next
    );

    expect((next.mock.calls[0][0] as ApiError).message).toBe('CSRF validation failed');
    expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(403);
  });

  it('requires both the cookie and the header to be present', () => {
    const next = vi.fn();

    requireCsrf(
      { method: 'POST', cookies: {}, header: () => 'token' } as never,
      {} as never,
      next
    );
    requireCsrf(
      { method: 'POST', cookies: { pb_csrf: 'token' }, header: () => undefined } as never,
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls.every(([error]) => (error as ApiError).message === 'CSRF validation failed')).toBe(
      true
    );
  });

  it('allows safe methods and matching tokens through', () => {
    const next = vi.fn();

    requireCsrf({ method: 'GET', cookies: {} } as never, {} as never, next as never);
    expect(next).toHaveBeenCalledOnce();

    requireCsrf(
      { method: 'POST', cookies: { pb_csrf: 'same' }, header: () => 'same' } as never,
      {} as never,
      next as never
    );
    expect(next).toHaveBeenCalledTimes(2);
  });
});