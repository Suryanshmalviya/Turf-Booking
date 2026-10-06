import type { AvailabilityQuery, BookingListQuery } from '../types/booking';
import type { VenueSearchParams } from '../types/court';
import type { AdminBookingQuery, AdminListQuery } from './admin.api';
import type { NotificationFilters } from './notification.api';
import type { ReviewListFilters } from './review.api';

/** Record tabs of the administrative console that paginate a server list. */
export type AdminTab = 'queue' | 'users' | 'venues' | 'bookings';

/**
 * Centralised query keys. Keeping them here means a mutation can invalidate a
 * list without re-typing the key segments, and the shapes stay consistent.
 *
 * Every key starts with a domain segment, so `invalidateQueries({ queryKey:
 * queryKeys.bookings.all() })` prefix-matches every booking query regardless of
 * its filters.
 */
export const queryKeys = {
  session: () => ['session'] as const,

  profile: () => ['profile'] as const,
  sessions: () => ['profile', 'sessions'] as const,
  assignments: () => ['profile', 'assignments'] as const,

  venues: {
    all: () => ['venues'] as const,
    list: (params: VenueSearchParams) => ['venues', 'list', params] as const,
    detail: (venueId: string) => ['venues', 'detail', venueId] as const,
    schedule: (venueId: string) => ['venues', 'schedule', venueId] as const,
    reviews: (venueId: string, filters: ReviewListFilters = {}) =>
      ['venues', venueId, 'reviews', filters] as const,
    rating: (venueId: string) => ['venues', venueId, 'rating'] as const,
  },

  availability: (query: AvailabilityQuery) =>
    ['availability', query.venueId, query.pitchId, query.date, query.durationMinutes] as const,

  bookings: {
    all: () => ['bookings'] as const,
    list: (query: BookingListQuery = {}) => ['bookings', 'list', query] as const,
    detail: (bookingId: string) => ['bookings', 'detail', bookingId] as const,
  },

  payments: {
    all: () => ['payments'] as const,
    booking: (bookingId: string) => ['payments', 'booking', bookingId] as const,
  },

  reviews: {
    all: () => ['reviews'] as const,
    list: (filters: ReviewListFilters = {}) => ['reviews', 'list', filters] as const,
    mine: (filters: { page?: number; limit?: number } = {}) =>
      ['reviews', 'mine', filters] as const,
    detail: (reviewId: string) => ['reviews', 'detail', reviewId] as const,
  },

  notifications: {
    all: () => ['notifications'] as const,
    list: (filters: NotificationFilters = {}) => ['notifications', 'list', filters] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },

  admin: {
    all: () => ['admin'] as const,
    database: () => ['admin', 'database'] as const,
    seed: () => ['admin', 'seed'] as const,
    /** Kept for the legacy single-page console tab view. */
    list: (tab: AdminTab, page: number) => ['admin', tab, page] as const,
    /** Prefix covering every page of one tab, for pagination-aware invalidation. */
    tab: (tab: AdminTab) => ['admin', tab] as const,

    report: (from: string, to: string) => ['admin', 'report', from, to] as const,
    recentBookings: () => ['admin', 'recent-bookings'] as const,
    bookingCount: (filter: { status?: string; from?: string; to?: string }) =>
      ['admin', 'booking-count', filter] as const,

    users: (query: AdminListQuery) => ['admin', 'users', query] as const,
    venues: (query: AdminListQuery) => ['admin', 'venues', query] as const,
    queue: () => ['admin', 'venues', 'queue'] as const,
    adminBookings: (query: AdminBookingQuery) => ['admin', 'bookings', query] as const,
    bookingPayments: (bookingId: string) => ['admin', 'bookings', bookingId, 'payments'] as const,
  },
};
