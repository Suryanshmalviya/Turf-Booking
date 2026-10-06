import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { assertBookingAccess } from '../services/bookings.service';
import { assertVenueAccess } from '../services/courts.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

function venueIdFromRequest(request: Request): string {
  const id = request.params.venueId ?? request.params.id;
  if (!id) throw ApiError.badRequest('venueId path parameter is required');
  return id;
}

function bookingIdFromRequest(request: Request): string {
  const id = request.params.bookingId ?? request.params.id;
  if (!id) throw ApiError.badRequest('bookingId path parameter is required');
  return id;
}

/**
 * Grants access to venue-scoped resources only to the venue owner, active venue
 * staff, or an administrator. The ownership decision lives in the courts
 * service; this middleware only adapts it to the request pipeline.
 */
export function requireVenueAccess(): RequestHandler {
  return asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user) throw ApiError.unauthorized('Authentication required');
    await assertVenueAccess(venueIdFromRequest(request), request.user);
    next();
  });
}

/** Grants access to a booking only to its owner or an authorized venue operator. */
export function requireBookingAccess(): RequestHandler {
  return asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user) throw ApiError.unauthorized('Authentication required');
    await assertBookingAccess(bookingIdFromRequest(request), request.user);
    next();
  });
}

/**
 * Ownership guard for `/me`-style sub-resources: the subject in the token must
 * match the identifier in the path.
 */
export function requireSelf(paramName = 'userId'): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (request.params[paramName] !== request.user.sub) {
      next(ApiError.forbidden('You may only access your own resources'));
      return;
    }
    next();
  };
}