import type { Request, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';

import { config } from '../config';
import { ApiError } from '../utils/api-error';

const WINDOW_MS = config.rateLimit.windowMs;

function handler(code: string, message: string) {
  return (_request: Request, _response: Response, next: (error?: unknown) => void): void => {
    next(
      new ApiError(
        429,
        code,
        message,
        config.rateLimit.enabled ? { retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) } : undefined
      )
    );
  };
}

function build(options: Partial<Options> & { max: number }): Options {
  return {
    windowMs: WINDOW_MS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Rate limiting is skipped in the test environment so suites can exercise
    // every endpoint without sharing a single in-memory window.
    skip: () => !config.rateLimit.enabled || config.nodeEnv === 'test',
    ...options,
  } as Options;
}

/** Broad protection applied to the whole API surface. */
export function globalLimiter(): Options {
  return build({
    max: config.rateLimit.maxRequests,
    handler: handler('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later'),
  });
}

/** Tight limit for credential endpoints to blunt brute-force attempts. */
export function authLimiter(): Options {
  return build({
    max: config.rateLimit.authMaxRequests,
    handler: handler('AUTH_RATE_LIMITED', 'Too many authentication attempts'),
  });
}

/**
 * Very tight limit for account recovery. These endpoints only ever send mail, so
 * a small budget is enough and it removes token brute-forcing and mail bombing.
 */
export function passwordRecoveryLimiter(): Options {
  return build({
    max: config.rateLimit.passwordRecoveryMaxRequests,
    handler: handler(
      'PASSWORD_RECOVERY_RATE_LIMITED',
      'Too many password recovery attempts, please try again later'
    ),
  });
}

/** Applied to mutating routes to protect inventory and payment paths. */
export function writeLimiter(): Options {
  return build({
    max: config.rateLimit.writeMaxRequests,
    handler: handler('WRITE_RATE_LIMITED', 'Too many write operations, please slow down'),
  });
}

/** Creates an ad-hoc limiter for a specific route (e.g. admin seed/import). */
export function createLimiter(max: number, code: string, message: string): Options {
  return build({ max, handler: handler(code, message) });
}

export const limiters = { global: globalLimiter, auth: authLimiter, write: writeLimiter };

export { rateLimit };
