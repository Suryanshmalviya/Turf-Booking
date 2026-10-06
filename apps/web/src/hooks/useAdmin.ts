import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminApi, type AdminBookingQuery, type AdminListQuery,HISTORY_FROM, HISTORY_TO } from '../services/admin.api';
import { queryKeys } from '../services/queryKeys';
import type {
  AdminBooking,
  AdminReport,
  AdminUser,
  AdminUserUpdate,
  AdminVenue,
  DatabaseStatus,
  VenueAction,
} from '../types/admin';
import type { CreateVenueInput } from '../types/court';

/**
 * Administrative console reads and writes.
 *
 * Nothing here checks roles: the server rejects every one of these calls unless
 * the caller is an administrator, and `AdminRoute` keeps the UI honest.
 */

/** Live connection health and document counts per collection. */
export function useDatabaseStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.database(),
    queryFn: ({ signal }) => adminApi.database(signal),
    enabled,
  });
}

/** Aggregate report for an explicit `[from, to)` window. */
export function useAdminReport(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.report(from, to),
    queryFn: ({ signal }) => adminApi.report(from, to, signal),
    enabled,
  });
}

/** Court utilisation and revenue across all stored history. */
export function useLifetimeReport(enabled = true) {
  return useAdminReport(HISTORY_FROM, HISTORY_TO, enabled);
}

/** Newest bookings for the dashboard activity feed. */
export function useRecentBookings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.recentBookings(),
    queryFn: ({ signal }) => adminApi.recentBookings(8, signal),
    enabled,
  });
}

/**
 * Bookings starting within `[from, to)`, optionally by status.
 *
 * Used for the "today" and "upcoming" figures: the report's window is closed on
 * both ends, so an open-ended future range cannot be expressed through it.
 */
export function useBookingCount(filter: { status?: string; from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.bookingCount(filter),
    queryFn: ({ signal }) => adminApi.bookingCount(filter, signal),
    enabled,
  });
}

export function useAdminBookings(query: AdminBookingQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.adminBookings(query),
    queryFn: ({ signal }) => adminApi.bookings(query, signal),
    enabled,
  });
}

export function useAdminUsers(query: AdminListQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.users(query),
    queryFn: ({ signal }) => adminApi.users(query, signal),
    enabled,
  });
}

export function useAdminVenues(query: AdminListQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.venues(query),
    queryFn: ({ signal }) => adminApi.venues(query, signal),
    enabled,
  });
}

export function useVenueQueue(enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.queue(),
    queryFn: ({ signal }) => adminApi.venueQueue(1, signal),
    enabled,
  });
}

/** Payment attempts, refunds and audit trail for one booking. */
export function useBookingPayments(bookingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.bookingPayments(bookingId ?? ''),
    queryFn: ({ signal }) => adminApi.bookingPayments(bookingId as string, signal),
    enabled: enabled && Boolean(bookingId),
  });
}

/** Seed the database with sample venues, courts and schedules. */
export function useSeedDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminApi.seed(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.all() });
    },
  });
}

/**
 * Approve, reject or suspend a court.
 *
 * The whole venue cache is invalidated rather than one page: the moderated
 * record leaves whatever page it was on.
 */
export function useReviewVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ venueId, action, reason }: { venueId: string; action: VenueAction; reason: string }) =>
      adminApi.reviewVenue(venueId, action, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.all() });
    },
  });
}

/** Store a new venue together with its first court, hours and price. */
export function useCreateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVenueInput) => adminApi.createVenue(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.all() });
    },
  });
}

/**
 * Change a user's role or account status.
 *
 * Suspending or deleting a user revokes their sessions server-side, so the
 * session cache is refreshed to reflect the acting account too.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, ...body }: AdminUserUpdate & { userId: string }) =>
      adminApi.updateUser(userId, body),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
      queryClient.setQueryData<AdminUser[]>(['admin', 'users'], undefined);
      if (result.email) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      }
    },
  });
}

/** Drain the notification outbox. */
export function useProcessNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminApi.processNotifications(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export type { AdminBooking, AdminReport, AdminUser, AdminVenue, DatabaseStatus };