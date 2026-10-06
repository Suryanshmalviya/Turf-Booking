import type { AuthUser, LoginInput, RegisterInput } from '../types/auth';
import { isUnauthorized } from '../utils/error';
import { request, requestWithMeta } from './api-client';

/**
 * Credential and session endpoints.
 *
 * Access and refresh tokens are `HttpOnly` cookies: nothing token-shaped ever
 * reaches JavaScript, and no response body carries a credential.
 */

export interface AuthMessageResult {
  message: string;
}

export interface ForgotPasswordResult extends AuthMessageResult {
  emailVerified?: boolean;
}

export interface ResetPasswordResult extends AuthMessageResult {
  revokedSessions: number;
}

export interface VerifyEmailResult {
  emailVerified: boolean;
  message: string;
}

export interface ResendVerificationResult {
  emailVerified?: boolean;
  message: string;
}

export const authApi = {
  register(input: RegisterInput) {
    return request<{ user: AuthUser }>('/auth/register', { method: 'POST', body: input });
  },

  login(input: LoginInput) {
    return request<{ user: AuthUser }>('/auth/login', { method: 'POST', body: input });
  },

  /** 204 on success. Tolerates an already-ended session. */
  logout() {
    return request<void>('/auth/logout', { method: 'POST' });
  },

  /** Rotate the access cookie. The client calls this itself after a 401. */
  refresh() {
    return request<{ user: AuthUser }>('/auth/refresh', { method: 'POST' });
  },

  /**
   * Resolve the current session.
   *
   * A 401 is an expected answer meaning "not signed in" and resolves to `null`.
   * Anything else — a 500, an unreachable API — is re-thrown so the UI can offer
   * a retry instead of silently pretending the visitor signed out.
   */
  async me(signal?: AbortSignal): Promise<AuthUser | null> {
    try {
      const { data } = await requestWithMeta<{ user: AuthUser }>('/auth/me', { signal });
      return data?.user ?? null;
    } catch (error) {
      if (isUnauthorized(error)) return null;
      throw error;
    }
  },

  /** Always acknowledges, so it cannot be used to discover registered addresses. */
  forgotPassword(email: string) {
    return request<ForgotPasswordResult>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  resetPassword(input: { token: string; password: string; confirmPassword?: string }) {
    return request<ResetPasswordResult>('/auth/reset-password', { method: 'POST', body: input });
  },

  verifyEmail(token: string) {
    return request<VerifyEmailResult>('/auth/verify-email', { method: 'POST', body: { token } });
  },

  resendVerification() {
    return request<ResendVerificationResult>('/auth/resend-verification', { method: 'POST' });
  },
};
