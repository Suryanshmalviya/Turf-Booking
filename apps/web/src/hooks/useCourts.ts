import { useQuery } from '@tanstack/react-query';

import { courtApi } from '../services/court.api';
import { queryKeys } from '../services/queryKeys';
import type { AvailabilityQuery } from '../types/booking';
import type { VenueSearchParams } from '../types/court';

/** Published venues matching the current search filters. */
export function useVenues(params: VenueSearchParams) {
  return useQuery({
    queryKey: queryKeys.venues.list(params),
    queryFn: ({ signal }) => courtApi.list(params, signal),
  });
}

/** A single venue with its courts. */
export function useVenueDetail(venueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.venues.detail(venueId ?? ''),
    queryFn: ({ signal }) => courtApi.detail(venueId as string, signal),
    enabled: Boolean(venueId),
  });
}

/** Operating hours, exceptions and price rules for a venue. */
export function useVenueSchedule(venueId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.venues.schedule(venueId ?? ''),
    queryFn: ({ signal }) => courtApi.schedule(venueId as string, signal),
    enabled: Boolean(venueId),
  });
}

/**
 * Bookable slots for one court on one day. Kept disabled until a court and date
 * are chosen so the page never fires a request for an incomplete selection.
 */
export function useAvailability(query: AvailabilityQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.availability(query),
    queryFn: ({ signal }) =>
      courtApi.availability(
        query.venueId,
        query.pitchId,
        query.date,
        query.durationMinutes,
        signal
      ),
    enabled: enabled && Boolean(query.pitchId) && Boolean(query.date),
  });
}
