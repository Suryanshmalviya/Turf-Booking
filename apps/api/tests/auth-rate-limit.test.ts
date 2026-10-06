import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { config } from '../src/config';
import { authLimiter, passwordRecoveryLimiter } from '../src/middleware/rate-limit';
import { UserModel } from '../src/models/auth.model';
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/test-db';

/**
 * Rate limiting is disabled by default under `NODE_ENV=test` so ordinary suites
 * never share a window. This suite switches the limiters back on to prove the
 * credential endpoints are actually throttled, then restores the configuration.
 */

const originalNodeEnv = config.nodeEnv;
const originalEnabled = config.rateLimit.enabled;
const originalBcryptRounds = config.bcrypt.rounds;

beforeAll(async () => {
  config.bcrypt.rounds = 4;
  await startTestDatabase();

  // `skip` consults both flags per request, so flipping them here takes effect
  // for the limiters that were created when the routes were mounted.
  config.rateLimit.enabled = true;
  config.nodeEnv = 'development';
});

afterAll(async () => {
  config.nodeEnv = originalNodeEnv;
  config.rateLimit.enabled = originalEnabled;
  config.bcrypt.rounds = originalBcryptRounds;
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

describe('authentication rate limiting', () => {
  it('blocks repeated failed logins once the budget is spent', async () => {
    await UserModel.create({
      email: 'player@example.com',
      displayName: 'Test Player',
      role: 'customer',
      status: 'active',
      emailVerified: true,
      passwordHash: '$2b$04$abcdefghijklmnopqrstuuKz5Xh0OQ3nH1cCvJ0Yq0n6b0dJ8Kz1k5S',
    });

    const budget = config.rateLimit.authMaxRequests;
    for (let attempt = 0; attempt < budget; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'player@example.com', password: 'Wr0ngPassphrase' });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'player@example.com', password: 'Wr0ngPassphrase' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('AUTH_RATE_LIMITED');
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
  });

  it('does not lock out endpoints that carry no credentials', async () => {
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'player@example.com', password: 'Wr0ngPassphrase' });
    expect(blocked.status).toBe(429);

    const directory = await request(app).get('/api/v1/users');
    expect(directory.status).toBe(401);
    expect(directory.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('account recovery rate limiting', () => {
  it('shares one small budget across requesting and redeeming a recovery link', async () => {
    const budget = config.rateLimit.passwordRecoveryMaxRequests;
    for (let attempt = 0; attempt < budget; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'player@example.com' });
      expect(response.status).toBe(202);
    }

    const blockedRequest = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'player@example.com' });
    expect(blockedRequest.status).toBe(429);
    expect(blockedRequest.body.error.code).toBe('PASSWORD_RECOVERY_RATE_LIMITED');

    // Guessing a recovery token draws from the same budget.
    const blockedReset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'd'.repeat(64), password: 'Str0ngPassphrase' });
    expect(blockedReset.status).toBe(429);
    expect(blockedReset.body.error.code).toBe('PASSWORD_RECOVERY_RATE_LIMITED');
  });
});

describe('limiter configuration', () => {
  it('is inert while rate limiting is disabled', () => {
    config.rateLimit.enabled = false;
    config.nodeEnv = 'test';

    expect(authLimiter().skip?.({} as never, {} as never)).toBe(true);
    expect(passwordRecoveryLimiter().skip?.({} as never, {} as never)).toBe(true);
  });

  it('sizes the credential and recovery budgets from configuration', () => {
    config.rateLimit.enabled = true;
    config.nodeEnv = 'development';

    expect(authLimiter().max).toBe(config.rateLimit.authMaxRequests);
    expect(passwordRecoveryLimiter().max).toBe(config.rateLimit.passwordRecoveryMaxRequests);
    expect(passwordRecoveryLimiter().max).toBeLessThanOrEqual(authLimiter().max);
    expect(authLimiter().skip?.({} as never, {} as never)).toBe(false);
  });
});
