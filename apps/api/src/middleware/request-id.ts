import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns a correlation id to every request, honouring an upstream
 * `X-Request-ID` so requests can be traced across service boundaries.
 */
export function requestId(): (request: Request, response: Response, next: NextFunction) => void {
  return (request: Request, response: Response, next: NextFunction): void => {
    const inbound = request.headers['x-request-id'];
    const id = typeof inbound === 'string' && inbound.trim() ? inbound.trim() : randomUUID();
    request.requestId = id;
    response.setHeader('X-Request-ID', id);
    next();
  };
}
