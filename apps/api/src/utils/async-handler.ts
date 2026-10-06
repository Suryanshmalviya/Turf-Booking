import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Bridges promise rejections from controllers and async middleware into the
 * Express error pipeline (Express 4 does not await handlers itself).
 */
export function asyncHandler(
  fn: (request: Request, response: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    Promise.resolve(fn(request, response, next)).catch(next);
  };
}

/** Variant used for async middleware so authorization failures reach the handler. */
export const asyncMiddleware = asyncHandler;