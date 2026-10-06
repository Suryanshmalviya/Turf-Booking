import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';

import { config, logger } from '../config';
import type { ApiErrorBody, ErrorDetail } from '../types/api';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

interface NormalisedError {
  status: number;
  body: ApiErrorBody;
  logLevel: 'warn' | 'error';
}

/** Terminal 404 handler for requests that matched no route. */
export function notFoundHandler(request: Request, _response: Response, next: NextFunction): void {
  next(
    new ApiError(404, 'NOT_FOUND', `Route ${request.method} ${request.originalUrl} not found`)
  );
}

interface DuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

const isDuplicateKeyError = (error: unknown): error is DuplicateKeyError =>
  typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;

const duplicateKeyMessage = (error: DuplicateKeyError): string => {
  const field = Object.keys(error.keyPattern ?? {})[0] ?? Object.keys(error.keyValue ?? {})[0];
  return field ? `${field} is already in use` : 'Duplicate key';
};

function hasStatus(error: unknown, status: number, type?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: number; statusCode?: number; type?: string };
  if (type && candidate.type === type) return true;
  return candidate.status === status || candidate.statusCode === status;
}

function normalise(error: unknown): NormalisedError {
  if (error instanceof ApiError) {
    return {
      status: error.statusCode,
      body: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      logLevel: error.statusCode >= 500 ? 'error' : 'warn',
    };
  }

  if (error instanceof ZodError) {
    const details: ErrorDetail[] = error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return {
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      logLevel: 'warn',
    };
  }

  if (error instanceof jwt.TokenExpiredError) {
    return { status: 401, body: { code: 'TOKEN_EXPIRED', message: 'Access session expired' }, logLevel: 'warn' };
  }

  if (error instanceof jwt.JsonWebTokenError) {
    return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Invalid authentication session' }, logLevel: 'warn' };
  }

  if (error instanceof MongooseError.ValidationError) {
    const details: ErrorDetail[] = Object.values(error.errors).map(item => ({
      field: item.path,
      message: item.message,
    }));
    return {
      status: 400,
      body: { code: 'DATABASE_VALIDATION_ERROR', message: 'Record validation failed', details },
      logLevel: 'warn',
    };
  }

  if (error instanceof MongooseError.CastError) {
    return {
      status: 400,
      body: { code: 'INVALID_IDENTIFIER', message: `Invalid value for ${error.path}` },
      logLevel: 'warn',
    };
  }

  if (isDuplicateKeyError(error)) {
    return {
      status: 409,
      body: { code: 'DUPLICATE_RESOURCE', message: duplicateKeyMessage(error) },
      logLevel: 'warn',
    };
  }

  if (hasStatus(error, 413, 'entity.too.large')) {
    return {
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
      logLevel: 'warn',
    };
  }

  if (hasStatus(error, 400, 'entity.parse.failed')) {
    return {
      status: 400,
      body: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
      logLevel: 'warn',
    };
  }

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  return {
    status: 500,
    body: {
      code: 'INTERNAL_ERROR',
      message:
        config.nodeEnv === 'production' ? 'An unexpected error occurred' : message,
    },
    logLevel: 'error',
  };
}

/**
 * Centralised error handler. Must stay last in the middleware stack and must
 * keep the four-argument signature for Express to recognise it.
 */
export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void {
  if (response.headersSent) {
    logger.error({ err: error, requestId: request.requestId }, 'Error after response sent');
    response.end();
    return;
  }

  const { status, body, logLevel } = normalise(error);

  logger[logLevel](
    {
      err: error,
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
      status,
      userId: request.user?.sub,
    },
    'request failed'
  );

  response.status(status).json({
    success: false,
    error: body,
    requestId: request.requestId,
  });
}

/** Wraps a handler so any thrown/rejected value reaches `errorHandler`. */
export const asyncRoute = asyncHandler;