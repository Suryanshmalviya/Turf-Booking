import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/index';

describe('environment configuration', () => {
  const secrets = { JWT_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) };

  it('loads typed defaults and supplied values', () => {
    const config = loadConfig({ ...secrets, PORT: '4100', LOG_FORMAT: 'pretty' });

    expect(config.port).toBe(4100);
    expect(config.log.format).toBe('pretty');
    expect(config.apiPrefix).toBe('/api/v1');
    expect(config.pagination.defaultLimit).toBe(20);
    expect(config.pagination.maxLimit).toBe(100);
  });

  it('derives the API prefix from the version', () => {
    expect(loadConfig({ ...secrets, API_VERSION: 'v2' }).apiPrefix).toBe('/api/v2');
    expect(loadConfig({ ...secrets, API_VERSION: 'v2', API_PREFIX: '/custom' }).apiPrefix).toBe(
      '/custom'
    );
  });

  it('exposes throttling, pagination and hold configuration', () => {
    const config = loadConfig({
      ...secrets,
      RATE_LIMIT_MAX_REQUESTS: '50',
      RATE_LIMIT_AUTH_MAX_REQUESTS: '3',
      RATE_LIMIT_PASSWORD_RECOVERY_MAX_REQUESTS: '2',
      RATE_LIMIT_ENABLED: 'false',
      BOOKING_HOLD_MINUTES: '15',
    });

    expect(config.rateLimit).toEqual({
      enabled: false,
      windowMs: 900000,
      maxRequests: 50,
      authMaxRequests: 3,
      writeMaxRequests: 60,
      passwordRecoveryMaxRequests: 2,
    });
    expect(config.booking.holdMinutes).toBe(15);
  });

  it('exposes account verification and recovery settings', () => {
    const defaults = loadConfig(secrets);

    expect(defaults.auth.requireEmailVerification).toBe(true);
    expect(defaults.auth.emailVerificationTtlMinutes).toBe(1440);
    expect(defaults.auth.passwordResetTtlMinutes).toBe(60);

    const configured = loadConfig({
      ...secrets,
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
      EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '120',
      PASSWORD_RESET_TOKEN_TTL_MINUTES: '15',
    });

    expect(configured.auth.requireEmailVerification).toBe(false);
    expect(configured.auth.emailVerificationTtlMinutes).toBe(120);
    expect(configured.auth.passwordResetTtlMinutes).toBe(15);
  });

  it('rejects a recovery window that is too long to be safe', () => {
    expect(() => loadConfig({ ...secrets, PASSWORD_RESET_TOKEN_TTL_MINUTES: '5000' })).toThrow();
    expect(() => loadConfig({ ...secrets, EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '1' })).toThrow();
  });

  it('rejects missing or short JWT secrets', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'short' })).toThrow();
  });

  it('rejects insecure authentication cookies in production', () => {
    expect(() => loadConfig({ ...secrets, NODE_ENV: 'production' })).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('rejects SameSite=None without secure cookies', () => {
    expect(() =>
      loadConfig({ ...secrets, AUTH_COOKIE_SAME_SITE: 'none', AUTH_COOKIE_SECURE: 'false' })
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('rejects a default page size larger than the maximum', () => {
    expect(() =>
      loadConfig({ ...secrets, PAGINATION_DEFAULT_LIMIT: '50', PAGINATION_MAX_LIMIT: '20' })
    ).toThrow(/PAGINATION_MAX_LIMIT/);
  });
});
