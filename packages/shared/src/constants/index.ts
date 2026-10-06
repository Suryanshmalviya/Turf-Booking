export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BOOKING_OVERLAP: 'BOOKING_OVERLAP',
  VENUE_NOT_APPROVED: 'VENUE_NOT_APPROVED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
} as const;

export const USER_ROLES = {
  CUSTOMER: 'customer',
  OWNER: 'owner',
  ADMIN: 'admin',
} as const;

export const VENUE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  PARTIALLY_REFUNDED: 'partially_refunded',
} as const;

export const PITCH_TYPES = {
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
  COVERED: 'covered',
} as const;

export const SURFACE_TYPES = {
  ARTIFICIAL_TURF: 'artificial_turf',
  ACRYLIC: 'acrylic',
  CONCRETE: 'concrete',
  WOOD: 'wood',
  CLAY: 'clay',
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const JWT_ACCESS_TOKEN_EXPIRY = '15m';
export const JWT_REFRESH_TOKEN_EXPIRY = '7d';

export const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;
export const DEFAULT_CURRENCY = 'USD';

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;
