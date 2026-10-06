import type { NextFunction, Request, Response } from 'express';

import { ApiError } from './api-error';

/** Reads a required `Idempotency-Key` header, falling back to the body field. */
export function requireIdempotencyKey(request: Request): string {
  const key =
    request.header('Idempotency-Key') ??
    (request.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw ApiError.badRequest('Idempotency-Key header is required');
  }
  return key.trim();
}

/** Returns the correlation id assigned by the request-id middleware. */
export function requestIdOf(request: Request, response?: Response, _next?: NextFunction): string {
  return request.requestId ?? (response?.getHeader('X-Request-ID') as string | undefined) ?? 'unknown';
}

export function clientIp(request: Request): string | undefined {
  return request.ip ?? request.socket.remoteAddress ?? undefined;
}

export function userAgent(request: Request): string | undefined {
  return request.get('user-agent') ?? undefined;
}