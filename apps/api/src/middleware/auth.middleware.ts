import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '../config';
import type { JwtPayload } from '../types/auth';
import { ApiError } from '../utils/api-error';

/**
 * Authentication middleware: access-token verification, the authentication gate
 * and the cookie/CSRF plumbing used to carry the session. Role evaluation lives
 * in `./role.middleware`.
 */

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
}

const cookieOptions = (httpOnly: boolean): CookieOptions => ({
  httpOnly,
  secure: config.auth.cookieSecure,
  sameSite: config.auth.sameSite,
  path: '/',
});

function extractAccessToken(request: Request): string | undefined {
  const fromCookie = (request.cookies as Record<string, string> | undefined)?.[
    config.auth.accessCookieName
  ];
  if (fromCookie) return fromCookie;

  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

function verifyAccessToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (typeof payload === 'string' || !payload.sub || !payload.role) {
      throw ApiError.unauthorized('Invalid authentication session');
    }
    return payload as JwtPayload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof jwt.TokenExpiredError)
      throw ApiError.unauthorized('Access session expired');
    throw ApiError.unauthorized('Invalid authentication session');
  }
}

/** Hard authentication gate: populates `request.user` or rejects with 401. */
export function authenticate(): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const token = extractAccessToken(request);
    if (!token) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    try {
      request.user = verifyAccessToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Attaches the session when a valid token exists but never rejects. */
export function optionalAuth(): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const token = extractAccessToken(request);
    if (token) {
      try {
        request.user = verifyAccessToken(token);
      } catch {
        /* anonymous request */
      }
    }
    next();
  };
}

function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Double-submit CSRF protection for cookie-authenticated state changes. */
export function requireCsrf(request: Request, _response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  const cookieToken = (request.cookies as Record<string, string> | undefined)?.[
    config.auth.csrfCookieName
  ];
  const headerToken = request.header(config.auth.csrfHeaderName);
  if (!cookieToken || !headerToken || !safeCompare(cookieToken, headerToken)) {
    next(ApiError.forbidden('CSRF validation failed'));
    return;
  }
  next();
}

export function setCsrfCookie(response: Response): void {
  response.cookie(config.auth.csrfCookieName, randomBytes(32).toString('hex'), {
    ...cookieOptions(false),
    maxAge: config.auth.refreshCookieMaxAgeMs,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(config.auth.accessCookieName, cookieOptions(true));
  response.clearCookie(config.auth.refreshCookieName, cookieOptions(true));
  response.clearCookie(config.auth.csrfCookieName, cookieOptions(false));
}

export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  response.cookie(config.auth.accessCookieName, tokens.accessToken, {
    ...cookieOptions(true),
    maxAge: config.auth.accessCookieMaxAgeMs,
  });
  response.cookie(config.auth.refreshCookieName, tokens.refreshToken, {
    ...cookieOptions(true),
    maxAge: config.auth.refreshCookieMaxAgeMs,
  });
  setCsrfCookie(response);
}

export function refreshCookie(request: Request): string | undefined {
  return (request.cookies as Record<string, string> | undefined)?.[config.auth.refreshCookieName];
}

export function csrfCookie(request: Request): string | undefined {
  return (request.cookies as Record<string, string> | undefined)?.[config.auth.csrfCookieName];
}

/** Re-exported so consumers can build authenticated handlers without importing jwt. */
export { verifyAccessToken };
