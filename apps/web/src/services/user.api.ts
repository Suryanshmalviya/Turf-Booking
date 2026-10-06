import type { AuthUser } from '../types/auth';
import { request, requestWithMeta } from './api-client';

/** Endpoints for the signed-in user's own account. */

export interface SessionDevice {
  _id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  phone?: string;
}

export interface VenueAssignment {
  venueId: string;
  venueName?: string;
  role?: string;
}

/** Directory of users. Admin only on the server; the client never assumes it. */
export interface UserDirectoryEntry {
  _id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt?: string;
}

export const userApi = {
  /** The caller's own profile. Never contains password material. */
  profile(signal?: AbortSignal) {
    return request<{ user: AuthUser }>('/users/me', { signal });
  },

  updateProfile(input: UpdateProfileInput) {
    return request<{ user: AuthUser }>('/users/me', { method: 'PATCH', body: input });
  },

  /** Changing the password revokes every session, including this one. */
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return request<{ revokedSessions: number }>('/users/me/password', {
      method: 'POST',
      body: input,
    });
  },

  /** Active refresh sessions, newest first. */
  listSessions(signal?: AbortSignal) {
    return requestWithMeta<SessionDevice[]>('/users/me/sessions', { signal });
  },

  revokeSession(sessionId: string) {
    return request<void>(`/users/me/sessions/${sessionId}`, { method: 'DELETE' });
  },

  /** Venue staff assignments for the caller. */
  assignments(signal?: AbortSignal) {
    return request<{ assignments: VenueAssignment[] }>('/users/me/assignments', { signal });
  },

  /** Public user directory (admin on the server). */
  directory(signal?: AbortSignal) {
    return requestWithMeta<UserDirectoryEntry[]>('/users', { signal });
  },

  byId(userId: string, signal?: AbortSignal) {
    return request<{ user: AuthUser }>(`/users/${userId}`, { signal });
  },
};
