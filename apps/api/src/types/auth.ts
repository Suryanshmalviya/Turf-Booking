import type { UserRole } from './enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  status: string;
  emailVerified: boolean;
}

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
}
