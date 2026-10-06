import { create } from 'zustand';

import type { VenueSearchFormValues } from '../utils/validation';

export type VenueSearchFilters = VenueSearchFormValues;

const EMPTY_FILTERS: VenueSearchFilters = {
  q: '',
  city: '',
  date: '',
  time: '',
  maxPrice: '',
  feature: '',
};

/**
 * Venue discovery filters. Survives navigation away from the search page so a
 * customer does not lose their filters when opening a venue and coming back.
 */
interface VenueFilterState {
  filters: VenueSearchFilters;
  setFilters: (filters: VenueSearchFilters) => void;
  resetFilters: () => void;
}

export const useVenueFilterStore = create<VenueFilterState>()(set => ({
  filters: EMPTY_FILTERS,
  setFilters: filters => set({ filters }),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
}));

/** Strip empty strings so the query key and URL stay stable and cacheable. */
export function toSearchParams(filters: VenueSearchFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== '')
  );
}