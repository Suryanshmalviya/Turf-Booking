import type { ApiErrorBody } from '../types/api';

/**
 * Error thrown by the HTTP client. Carries the HTTP status and the API error
 * code so route guards and forms can branch without string matching messages.
 *
 * Transport failures (offline, DNS, timeout) are normalised into the same class
 * with `status: 0`, so every caller has exactly one error type to handle.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  /** Request id from the server, useful when reporting a problem. */
  readonly requestId?: string;

  constructor(
    status: number,
    body: ApiErrorBody | undefined,
    fallback: string,
    requestId?: string
  ) {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
    this.requestId = requestId;
  }
}

/** The request never reached the server, or the server did not answer in time. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

export function isTimeout(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'TIMEOUT';
}

/** The caller aborted deliberately — never surface this as a failure state. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** 401: no session, or the session expired and could not be refreshed. */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

/** 403: signed in, but not allowed. */
export function isForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}

export function isConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

export function isValidationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'VALIDATION_ERROR';
}

/** 429 or a server fault: worth offering the user a retry. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 0) return true;
    return error.status === 429 || error.status >= 500;
  }
  return true;
}

/** Field-level validation problems, flattened to `{ field, message }`. */
export interface FieldIssue {
  field: string;
  message: string;
}

export function validationIssues(error: unknown): FieldIssue[] {
  if (!isValidationError(error) || !Array.isArray(error.details)) return [];

  return error.details.flatMap((detail: unknown) => {
    if (detail && typeof detail === 'object' && 'field' in detail && 'message' in detail) {
      const { field, message } = detail as { field: string; message: string };
      return [{ field, message }];
    }
    return [];
  });
}

/** Narrow an unknown catch value to a human-readable message. */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return fallback;
}

/** A short, user-facing explanation that never leaks internals. */
export function toErrorTitle(error: unknown): string {
  if (isTimeout(error)) return 'The request timed out';
  if (isNetworkError(error)) return 'Cannot reach the server';
  if (isUnauthorized(error)) return 'Your session has expired';
  if (isForbidden(error)) return 'You do not have access to this';
  if (error instanceof ApiError && error.status === 429) return 'Too many requests';
  if (error instanceof ApiError && error.status >= 500) return 'The server had a problem';
  return 'Something went wrong';
}
