/** Domain types for courts (venues) and the pitches they contain. */

export interface VenueImage {
  key: string;
  url?: string;
  mimeType: string;
  sizeBytes: number;
  altText?: string;
}

export interface VenueAddress {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface Venue {
  _id: string;
  name: string;
  description?: string;
  timezone: string;
  address: VenueAddress;
  status?: string;
  currency?: string;
  images?: VenueImage[];
}

export interface Pitch {
  _id: string;
  name: string;
  description?: string;
  surface?: string;
  indoor: boolean;
  isActive: boolean;
}

export interface ScheduleRule {
  _id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
}

export interface ScheduleException {
  _id: string;
  date: string;
  kind: 'blackout' | 'special_open';
  startMinute?: number;
  endMinute?: number;
  reason?: string;
}

export interface PriceRule {
  _id: string;
  dayOfWeek?: number;
  startMinute?: number;
  endMinute?: number;
  amountMinor: number;
  currency: string;
  pricingUnit: 'booking' | 'hour';
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  priority: number;
}

export interface PublicVenueDetail {
  venue: Venue;
  pitches: Pitch[];
}

export interface VenueSchedule {
  rules: ScheduleRule[];
  exceptions: ScheduleException[];
  prices: PriceRule[];
}

/** Query accepted by the venue discovery endpoint. */
export interface VenueSearchParams {
  q?: string;
  city?: string;
  date?: string;
  time?: string;
  /** Price ceiling in **minor units** to match `PriceRule.amountMinor`. */
  maxPrice?: number;
  feature?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface CreateVenueInput {
  name: string;
  description?: string;
  city: string;
  line1?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  courtName?: string;
  courtSurface?: string;
  indoor?: boolean;
  pricePerHour?: number;
}

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const PITCH_FEATURE_OPTIONS = [
  { value: '', label: 'Any pitch' },
  { value: 'indoor', label: 'Indoor pitches' },
  { value: 'outdoor', label: 'Outdoor pitches' },
] as const;

export const BOOKING_DURATION_OPTIONS = [60, 90, 120] as const;

export type BookingDuration = (typeof BOOKING_DURATION_OPTIONS)[number];
