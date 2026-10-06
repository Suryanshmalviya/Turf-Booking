import type {
  AdminBooking,
  AdminBookingPayments,
  AdminPage,
  AdminReport,
  AdminUser,
  AdminUserResult,
  AdminUserUpdate,
  AdminVenue,
  DatabaseStatus,
  ProcessNotificationsResult,
  SeedResult,
  VenueAction,
} from '../types/admin';
import { ADMIN_PAGE_SIZE } from '../types/admin';
import type { CreateVenueInput, Venue } from '../types/court';
import { buildQuery, request } from './api-client';

/**
 * Administrative console endpoints.
 *
 * Every call here is rejected by the server unless the caller holds the `admin`
 * role, so the client never has to hide the routes — the guard is the API.
 */

/**
 * Wide window so an unfiltered console view reports the whole stored history
 * rather than silently truncating to the last 30 days.
 */
export const HISTORY_FROM = '2000-01-01T00:00:00.000Z';
export const HISTORY_TO = '2100-01-01T00:00:00.000Z';

/**
 * Normalises the page/limit pair every console list shares.
 *
 * `extra` is the caller's filter object, so it is spread through rather than
 * re-listed: a new filter field only has to be declared once, on the query type.
 */
function paged<TExtra extends object>(
  page: number,
  extra: TExtra = {} as TExtra,
  limit = ADMIN_PAGE_SIZE
): Record<string, string | number | undefined> {
  return { page, limit, ...extra };
}

export interface AdminBookingQuery {
  page?: number;
  limit?: number;
  /** Exact (case-insensitive) match on the public reference. */
  reference?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
}

export interface AdminListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  sort?: string;
}

export const adminApi = {
  // -------------------------------------------------------------- dashboard

  database(signal?: AbortSignal) {
    return request<DatabaseStatus>('/admin/database', { signal });
  },

  seed() {
    return request<SeedResult>('/admin/database/seed', { method: 'POST', body: {} });
  },

  /**
   * Aggregate report for `[from, to)`.
   *
   * `from`/`to` are ISO instants. The server matches on `startAt`, so a window
   * of "today" has to be computed in the venue's local terms by the caller.
   */
  report(from: string, to: string, signal?: AbortSignal) {
    return request<AdminReport>(`/admin/reports${buildQuery({ from, to })}`, { signal });
  },

  /** Recent bookings for the dashboard feed, newest first. */
  recentBookings(limit = 8, signal?: AbortSignal) {
    return request<AdminPage<AdminBooking>>(
      `/admin/bookings${buildQuery({ sort: '-createdAt', ...paged(1, {}, limit) })}`,
      { signal }
    );
  },

  /**
   * Total count only. Used for metrics the report cannot express (a booking
   * count has to respect an open-ended upper bound on `startAt`, which the
   * report's `[from, to)` window cannot do).
   */
  async bookingCount(
    filter: { status?: string; from?: string; to?: string } = {},
    signal?: AbortSignal
  ): Promise<number> {
    const page = await request<AdminPage<AdminBooking>>(
      `/admin/bookings${buildQuery(paged(1, { from: HISTORY_FROM, to: HISTORY_TO, ...filter }, 1))}`,
      { signal }
    );
    return page.total;
  },

  // -------------------------------------------------------------- users

  users(query: AdminListQuery = {}, signal?: AbortSignal) {
    return request<AdminPage<AdminUser>>(
      `/admin/users${buildQuery(paged(query.page ?? 1, query))}`,
      {
        signal,
      }
    );
  },

  updateUser(userId: string, body: AdminUserUpdate) {
    return request<AdminUserResult>(`/admin/users/${userId}`, { method: 'PATCH', body });
  },

  // -------------------------------------------------------------- courts

  venues(query: AdminListQuery = {}, signal?: AbortSignal) {
    return request<AdminPage<AdminVenue>>(
      `/admin/venues${buildQuery(paged(query.page ?? 1, query))}`,
      {
        signal,
      }
    );
  },

  /** Venues awaiting a moderation decision. */
  venueQueue(page = 1, signal?: AbortSignal) {
    return request<AdminPage<AdminVenue>>(`/admin/venues/queue${buildQuery(paged(page))}`, {
      signal,
    });
  },

  /**
   * Publish, reject or suspend a court. Every transition requires a reason: the
   * server writes an audit entry, so the reason is part of the record rather
   * than optional metadata.
   */
  reviewVenue(venueId: string, action: VenueAction, reason: string) {
    return request<{ venue: Venue }>(`/admin/venues/${venueId}/${action}`, {
      method: 'POST',
      body: { reason },
    });
  },

  /**
   * Creates a venue together with its first court, opening hours and hourly
   * price in one call, so the result is immediately bookable.
   */
  createVenue(input: CreateVenueInput) {
    return request<{ venue: Venue }>('/admin/venues', { method: 'POST', body: input });
  },

  // -------------------------------------------------------------- bookings

  bookings(query: AdminBookingQuery = {}, signal?: AbortSignal) {
    return request<AdminPage<AdminBooking>>(
      `/admin/bookings${buildQuery(paged(query.page ?? 1, query))}`,
      { signal }
    );
  },

  /** Payment attempts, refunds and audit trail for one booking. */
  bookingPayments(bookingId: string, signal?: AbortSignal) {
    return request<AdminBookingPayments>(`/admin/bookings/${bookingId}/payments`, { signal });
  },

  // -------------------------------------------------------------- platform

  /** Drain the notification outbox. Rate-limited to 5 requests per window. */
  processNotifications() {
    return request<ProcessNotificationsResult>('/admin/notifications/process', {
      method: 'POST',
      body: {},
    });
  },
};
