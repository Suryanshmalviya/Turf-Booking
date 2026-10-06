import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

import type { ErrorDetail } from '../types/api';
import { ApiError } from '../utils/api-error';

export type RequestSchemas = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
};

/**
 * Zod-backed validation middleware.
 *
 * The supplied schema is a single object describing the request sources it cares
 * about (e.g. `{ params, body, query }`). Validated and coerced values replace the
 * raw request values, so controllers only ever see schema-shaped input, and every
 * failure is normalised into a `VALIDATION_ERROR` ApiError with field details.
 */
export function validate(schema: ZodTypeAny): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.safeParseAsync({
        body: request.body,
        query: request.query,
        params: request.params,
      });

      if (!result.success) {
        const details: ErrorDetail[] = result.error.issues.map(issue => ({
          field: issue.path.join('.') || 'request',
          message: issue.message,
        }));

        next(ApiError.validation('Request validation failed', details));
        return;
      }

      const parsed = result.data as RequestSchemas;
      if (parsed.body !== undefined) request.body = parsed.body;
      if (parsed.params !== undefined) request.params = parsed.params as Request['params'];
      if (parsed.query !== undefined) {
        // `req.query` is a getter-only property on the Express prototype, so the
        // coerced values are merged into the existing (memoised) object.
        Object.assign(request.query as Record<string, unknown>, parsed.query);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
