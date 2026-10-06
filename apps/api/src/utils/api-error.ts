/**
 * Centralised operational error. Every error that crosses the service boundary is
 * an `ApiError` so the error middleware can produce a stable contract without
 * leaking stack traces or driver internals to clients.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';

    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(message = 'Request validation failed', details?: unknown): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource: string = 'Resource'): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }

  static serviceUnavailable(code: string, message: string): ApiError {
    return new ApiError(503, code, message);
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}