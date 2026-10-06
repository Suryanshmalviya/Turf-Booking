/**
 * Canonical runtime enumerations shared by the model, service, validator and
 * transport layers. Keeping them here (instead of inside a model file) avoids a
 * models -> types inversion while still allowing schemas to use them at runtime.
 */

/**
 * Roles are domain-scoped. `admin` is the single privileged tier (ADMIN); every
 * other role belongs to the unprivileged USER tier and is additionally scoped for
 * venue operations. `customer` is the default USER role created by registration.
 */
export const USER_ROLES = ['customer', 'venue_owner', 'venue_staff', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The privileged role required by admin-only surfaces. */
export const ADMIN_ROLE = 'admin';

/** The role assigned to self-service registrations (the base USER role). */
export const DEFAULT_USER_ROLE = 'customer';

/** Roles that are not administrators, i.e. the USER tier. */
export const NON_ADMIN_ROLES = USER_ROLES.filter(role => role !== ADMIN_ROLE);

/** Single-use, hashed tokens issued for account recovery and verification. */
export const AUTH_TOKEN_PURPOSES = ['email_verification', 'password_reset'] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const VENUE_STATUSES = [
  'draft',
  'pending_review',
  'active',
  'rejected',
  'suspended',
  'archived',
] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

export const BOOKING_STATUSES = [
  'held',
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'paid',
  'failed',
  'uncertain',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ['requested', 'processing', 'succeeded', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const AVAILABILITY_EXCEPTION_KINDS = ['blackout', 'special_open'] as const;
export type AvailabilityExceptionKind = (typeof AVAILABILITY_EXCEPTION_KINDS)[number];

export const PRICING_UNITS = ['booking', 'hour'] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

export const NOTIFICATION_TYPES = [
  'booking_confirmed',
  'booking_cancelled',
  'booking_reminder',
  'payment_failed',
  'refund_updated',
  'email_verification',
  'password_reset',
  'general',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'push', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['queued', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const REVIEW_STATUSES = ['published', 'flagged', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
