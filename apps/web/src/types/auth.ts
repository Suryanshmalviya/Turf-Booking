export const USER_ROLES = ['customer', 'venue_owner', 'venue_staff', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  status: string;
  /** `false` until the address is confirmed; sign-in is refused by the server. */
  emailVerified: boolean;
}

export interface AuthSession {
  user: AuthUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export function isAdminRole(role: UserRole | undefined): boolean {
  return role === 'admin';
}
