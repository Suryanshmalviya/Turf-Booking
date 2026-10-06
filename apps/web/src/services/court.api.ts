import type { AvailabilityInterval } from '../types/booking';
import type {
  CreateVenueInput,
  Pitch,
  PriceRule,
  PublicVenueDetail,
  ScheduleException,
  ScheduleRule,
  Venue,
  VenueSchedule,
  VenueSearchParams,
} from '../types/court';
import { buildQuery, request } from './api-client';

/**
 * Court discovery and management. `/courts` is the canonical surface; the server
 * keeps `/venues` as an alias.
 */

export interface VenueListResult {
  items: Venue[];
  total: number;
  page: number;
  limit: number;
}

/** Weekly opening hours, expressed in minutes from midnight. */
export interface AvailabilityRuleInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive?: boolean;
}

/** Price rule. `amountMinor` is in minor units, e.g. paise or cents. */
export interface PriceRuleInput {
  dayOfWeek?: number;
  startMinute?: number;
  endMinute?: number;
  startDate?: string;
  endDate?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  amountMinor: number;
  currency: string;
  pricingUnit: 'booking' | 'hour';
  priority?: number;
  isActive?: boolean;
}

export const courtApi = {
  /** Published venues matching the search filters. Rows and totals are inlined. */
  list(params: VenueSearchParams, signal?: AbortSignal) {
    return request<VenueListResult>(`/courts${buildQuery({ ...params })}`, { signal });
  },

  detail(venueId: string, signal?: AbortSignal) {
    return request<PublicVenueDetail>(`/courts/${venueId}`, { signal });
  },

  /** Operating hours, blackouts and price rules for a venue. */
  schedule(venueId: string, signal?: AbortSignal) {
    return request<VenueSchedule>(`/courts/${venueId}/schedule`, { signal });
  },

  /** Bookable intervals for one pitch on one day. */
  availability(
    venueId: string,
    pitchId: string,
    date: string,
    durationMinutes: number,
    signal?: AbortSignal
  ) {
    return request<{ intervals: AvailabilityInterval[] }>(
      `/courts/${venueId}/pitches/${pitchId}/availability${buildQuery({ date, durationMinutes })}`,
      { signal }
    );
  },

  create(input: CreateVenueInput) {
    return request<{ venue: Venue }>('/courts', { method: 'POST', body: input });
  },

  update(venueId: string, body: Partial<CreateVenueInput>) {
    return request<{ venue: Venue }>(`/courts/${venueId}`, { method: 'PATCH', body });
  },

  createPitch(venueId: string, body: Partial<Pitch>) {
    return request<{ pitch: Pitch }>(`/courts/${venueId}/pitches`, { method: 'POST', body });
  },

  /** Update a court's own attributes, including the active flag. */
  updatePitch(venueId: string, pitchId: string, body: Partial<Pitch>) {
    return request<{ pitch: Pitch }>(`/courts/${venueId}/pitches/${pitchId}`, {
      method: 'PATCH',
      body,
    });
  },

  /** Retire a court. Existing bookings are left untouched. */
  deletePitch(venueId: string, pitchId: string) {
    return request<void>(`/courts/${venueId}/pitches/${pitchId}`, { method: 'DELETE' });
  },

  /**
   * Add a weekly opening-hours window.
   *
   * The server rejects a window whose `endMinute` is not after `startMinute`, so
   * the client validates the same rule before submitting.
   */
  createAvailabilityRule(venueId: string, body: AvailabilityRuleInput) {
    return request<{ rule: ScheduleRule }>(`/courts/${venueId}/availability-rules`, {
      method: 'POST',
      body,
    });
  },

  /**
   * Add a price rule. Highest `priority` wins when several rules match a slot, so
   * an off-peak or weekend rule should be created with a higher priority than the
   * default hourly rate.
   */
  createPriceRule(venueId: string, body: PriceRuleInput) {
    return request<{ priceRule: PriceRule }>(`/courts/${venueId}/price-rules`, {
      method: 'POST',
      body,
    });
  },

  /** Close a court for one date, e.g. for maintenance. */
  addBlackout(venueId: string, body: { date: string; reason: string }) {
    return request<{ exception: ScheduleException }>(`/courts/${venueId}/blackouts`, {
      method: 'POST',
      body,
    });
  },
};
