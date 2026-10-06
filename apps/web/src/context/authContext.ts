import { createContext } from 'react';

import type { AuthUser, LoginInput, RegisterInput } from '../types/auth';

export interface AuthContextValue {
  /** `null` means the visitor is not signed in. */
  user: AuthUser | null;
  /** `true` while the session check is still in flight. Guards wait on this. */
  isBootstrapping: boolean;
  /** `true` when the session check failed; the guard offers a retry. */
  isSessionUnresolved: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-runs the session check after a failure. */
  retrySession: () => void;
}

// Kept in its own module (separate from the provider component) so that
// fast-refresh stays reliable and contexts can be imported without pulling in
// the provider implementation.
export const AuthContext = createContext<AuthContextValue | null>(null);
