import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authApi } from '../services/auth.api';
import { queryKeys } from '../services/queryKeys';
import { type UpdateProfileInput, userApi } from '../services/user.api';
import { useAuth } from './useAuth';

/** Profile, credentials and active sessions for the signed-in account. */

/** The caller's own profile, from the dedicated endpoint rather than the session. */
export function useProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: ({ signal }) => userApi.profile(signal),
    enabled,
  });
}

/** Active refresh sessions, so a device can be signed out remotely. */
export function useSessions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sessions(),
    queryFn: ({ signal }) => userApi.listSessions(signal),
    enabled,
  });
}

/** Venue staff assignments for the signed-in user. */
export function useVenueAssignments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments(),
    queryFn: ({ signal }) => userApi.assignments(signal),
    enabled,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => userApi.updateProfile(input),
    onSuccess: result => {
      // The header renders the display name from the session, so both caches move.
      queryClient.setQueryData(queryKeys.session(), result.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}

/**
 * Changing the password revokes every session, including this one, so the app
 * signs itself out afterwards instead of waiting for the next 401.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  const { logout } = useAuth();

  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      userApi.changePassword(input),
    onSuccess: async () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session(), null);
      // The cookie is already gone server-side; this only tidies up locally.
      await logout();
    },
  });
}

/** Sign out one device. Revoking the current session ends the local session too. */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => userApi.revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
  });
}

/** Ask for a recovery link. The API never reveals whether the account exists. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { token: string; password: string; confirmPassword?: string }) =>
      authApi.resetPassword(input),
    onSuccess: () => {
      // Every session was revoked, so nothing cached for this user is valid.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session(), null);
    },
  });
}

/** Confirm an address from an emailed link. */
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail(token),
    onSuccess: async () => {
      // Verification changes what the API will allow, so re-read the session.
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      await queryClient.refetchQueries({ queryKey: queryKeys.session() });
    },
  });
}

/** Ask for a fresh verification link while signed in. */
export function useResendVerification() {
  return useMutation({
    mutationFn: () => authApi.resendVerification(),
  });
}
