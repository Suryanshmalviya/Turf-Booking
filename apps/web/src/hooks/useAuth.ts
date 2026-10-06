import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '../context/authContext';

/**
 * Access the authenticated user and auth actions.
 * Must be used inside an `<AuthProvider>`.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
