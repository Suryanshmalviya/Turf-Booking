import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { ADMIN_ROLE, type UserRole } from '../types/enums';
import { ApiError } from '../utils/api-error';

/**
 * Role-based authorization middleware.
 *
 * Roles are two-tier: `admin` is the privileged tier and every other role is the
 * unprivileged USER tier, additionally scoped for venue operations. Guards run
 * after `authenticate()`, so a missing session is always a 401 and a wrong role
 * is always a 403 — never the other way around.
 */

/** Role-based access control. Synchronous so failures surface immediately. */
export function authorize(...roles: UserRole[]): RequestHandler {
  const allowed = new Set<UserRole>(roles);
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (!allowed.has(request.user.role)) {
      next(ApiError.forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Guards a route that any authenticated principal may use (the USER tier). */
export function requireUser(): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    next();
  };
}

/** Guards an ADMIN-only route. */
export function requireAdmin(): RequestHandler {
  return authorize(ADMIN_ROLE);
}

/** Guards a route that is either admin-only or limited to specific roles. */
export function requireAdminOr(...roles: UserRole[]): RequestHandler {
  return authorize(ADMIN_ROLE, ...roles);
}

/** Allows the owner of `:userId` or any administrator through. */
export function requireSelfOrAdmin(paramName = 'userId'): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const principal = request.user;
    if (!principal) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (principal.role === ADMIN_ROLE) {
      next();
      return;
    }
    const target = request.params[paramName];
    if (target && target !== principal.sub) {
      next(ApiError.forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
}

export { ADMIN_ROLE };