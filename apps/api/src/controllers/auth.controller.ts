import type { Request, Response } from 'express';

import { logger } from '../config';
import {
  clearAuthCookies,
  csrfCookie,
  refreshCookie,
  setAuthCookies,
  setCsrfCookie,
} from '../middleware/auth.middleware';
import {
  confirmEmailAddress,
  getCurrentUser,
  loginUser,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resendEmailVerification,
  resetPasswordWithToken,
  revokeSession,
} from '../services/auth.service';
import type { AuthResult } from '../types/auth';
import { ApiError } from '../utils/api-error';
import { sendAccepted, sendCreated, sendNoContent, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import { clientIp, userAgent } from '../utils/request';

/** Identical answer for known and unknown addresses so accounts cannot be probed. */
const RECOVERY_ACKNOWLEDGEMENT =
  'If an account exists for that email address, a password reset link is on its way';

function sessionMetadata(request: Request) {
  return { userAgent: userAgent(request), ipAddress: clientIp(request) };
}

/** Issues cookies for a fresh session and returns only the safe user projection. */
function establishSession(response: Response, result: AuthResult): void {
  setAuthCookies(response, result.tokens);
}

export const register = asyncHandler(async (request: Request, response: Response) => {
  const result = await registerUser(request.body as Parameters<typeof registerUser>[0], {
    userAgent: userAgent(request),
    ipAddress: clientIp(request),
  });

  establishSession(response, result);
  logger.info({ requestId: request.requestId }, 'Registration issued a session');
  sendCreated(response, { user: result.user });
});

export const login = asyncHandler(async (request: Request, response: Response) => {
  const result = await loginUser(request.body as Parameters<typeof loginUser>[0], {
    userAgent: userAgent(request),
    ipAddress: clientIp(request),
  });

  establishSession(response, result);
  sendSuccess(response, { user: result.user });
});

export const refresh = asyncHandler(async (request: Request, response: Response) => {
  const token = refreshCookie(request);
  if (!token) {
    clearAuthCookies(response);
    throw ApiError.unauthorized('Refresh session required');
  }

  const result = await refreshSession(token, {
    userAgent: userAgent(request),
    ipAddress: clientIp(request),
  });

  establishSession(response, result);
  sendSuccess(response, { user: result.user });
});

export const logout = asyncHandler(async (request: Request, response: Response) => {
  const token = refreshCookie(request);
  if (token) await revokeSession(token);
  clearAuthCookies(response);
  sendNoContent(response);
});

export const me = asyncHandler(async (request: Request, response: Response) => {
  const user = await getCurrentUser(request.user!.sub);
  if (!csrfCookie(request)) setCsrfCookie(response);
  sendSuccess(response, { user });
});

export const forgotPassword = asyncHandler(async (request: Request, response: Response) => {
  const { email } = request.body as { email: string };

  await requestPasswordReset(email, sessionMetadata(request));
  sendAccepted(response, { message: RECOVERY_ACKNOWLEDGEMENT });
});

export const resetPassword = asyncHandler(async (request: Request, response: Response) => {
  const { token, password } = request.body as { token: string; password: string };

  const result = await resetPasswordWithToken({ token, password });
  clearAuthCookies(response);
  sendSuccess(response, {
    message: 'Your password has been reset. Please sign in with your new password.',
    revokedSessions: result.revokedSessions,
  });
});

export const verifyEmail = asyncHandler(async (request: Request, response: Response) => {
  const { token } = request.body as { token: string };

  await confirmEmailAddress(token);
  sendSuccess(response, {
    emailVerified: true,
    message: 'Email address verified. You can now sign in.',
  });
});

export const resendVerification = asyncHandler(async (request: Request, response: Response) => {
  const result = await resendEmailVerification(request.user!.sub, sessionMetadata(request));

  if (result.alreadyVerified) {
    sendSuccess(response, { emailVerified: true, message: 'Email address is already verified' });
    return;
  }

  sendAccepted(response, { message: 'A new verification link has been sent to your inbox' });
});
