import type { NextFunction, Request, Response } from 'express';

import type { JwtPayload } from './auth';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `authenticate` / `optionalAuth` from the access token. */
      user?: JwtPayload;
      /** Raw request bytes, required for provider webhook signature verification. */
      rawBody?: Buffer;
      /** Correlation id echoed in the `X-Request-ID` response header. */
      requestId: string;
      /** Start timestamp used by the request logging middleware. */
      startedAt?: number;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export type RequestHandlerWithUser = (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction
) => unknown;