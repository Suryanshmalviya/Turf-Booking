import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';

import { onSessionExpired } from '../services/api-client';
import { authApi } from '../services/auth.api';
import { queryKeys } from '../services/queryKeys';
import type { AuthUser, LoginInput, RegisterInput } from '../types/auth';
import { AuthContext, type AuthContextValue } from './authContext';

/** Structural check: the session key is `['session']`, so compare the segment. */
function isSessionQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === queryKeys.session()[0];
}

/**
 * Session owner.
 *
 * The session is server state, so it lives in the query cache under
 * `queryKeys.session()`: every component reads the same entry, an expired token
 * is repaired by the API client without a reload, and signing out can drop the
 * whole cache in one step. Context is used only to broadcast it, which is what
 * the route guards and the header need.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: ({ signal }) => authApi.me(signal),
    // The session is checked once per page load; a stale answer is not useful.
    staleTime: 60_000,
    retry: false,
  });

  /**
   * When a refresh attempt fails the API client cannot know what to do with the
   * session, so it announces it here. Signed-out means "drop every cached
   * response": the previous user's bookings and profile must not stay on screen.
   */
  useEffect(
    () =>
      onSessionExpired(() => {
        queryClient.setQueryData(queryKeys.session(), null);
        queryClient.removeQueries({ predicate: query => !isSessionQuery(query.queryKey) });
      }),
    [queryClient]
  );

  const storeUser = useCallback(
    (user: AuthUser) => {
      // A new identity invalidates everything the previous user had loaded. Public
      // venue data is kept: it is not tied to an account.
      queryClient.removeQueries({
        predicate: query =>
          !isSessionQuery(query.queryKey) && query.queryKey[0] !== queryKeys.venues.all()[0],
      });
      queryClient.setQueryData(queryKeys.session(), user);
      return user;
    },
    [queryClient]
  );

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: result => storeUser(result.user),
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: result => storeUser(result.user),
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      // Whether or not the server answered, this browser is signed out.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session(), null);
    },
  });

  const login = useCallback(
    async (input: LoginInput) => {
      const { user } = await loginMutation.mutateAsync(input);
      return user;
    },
    [loginMutation]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { user } = await registerMutation.mutateAsync(input);
      return user;
    },
    [registerMutation]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // The session cookie may already be gone; the cache is cleared regardless.
    }
  }, [logoutMutation]);

  const retrySession = useCallback(() => {
    void sessionQuery.refetch();
  }, [sessionQuery]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data ?? null,
      isBootstrapping: sessionQuery.isPending,
      isSessionUnresolved: sessionQuery.isError,
      login,
      register,
      logout,
      retrySession,
    }),
    [
      sessionQuery.data,
      sessionQuery.isPending,
      sessionQuery.isError,
      login,
      register,
      logout,
      retrySession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
