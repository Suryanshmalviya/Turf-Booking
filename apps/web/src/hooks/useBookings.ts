import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bookingApi } from '../services/booking.api';
import { paymentApi } from '../services/payment.api';
import { queryKeys } from '../services/queryKeys';
import type { Booking, BookingListQuery, CreateHoldInput, PaymentAttemptResult } from '../types/booking';

/** The signed-in customer's bookings, with server-side filters. */
export function useMyBookings(query: BookingListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.bookings.list(query),
    queryFn: ({ signal }) => bookingApi.listMine(query, signal),
  });
}

/**
 * A single booking owned by the signed-in customer.
 *
 * `pollWhile` re-reads the booking on an interval while it is still on hold. The
 * server — not the client — decides when a payment settles, so checkout watches
 * the booking rather than trusting its own optimistic state.
 */
export function useBookingDetail(bookingId: string | undefined, pollWhile = false) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(bookingId ?? ''),
    queryFn: ({ signal }) => bookingApi.detail(bookingId as string, signal),
    enabled: Boolean(bookingId),
    ...(pollWhile ? { refetchInterval: 5000 } : {}),
  });
}

export interface CreateHoldResult {
  booking: Booking;
  payment: PaymentAttemptResult | null;
}

/**
 * Reserve a slot and immediately attempt payment.
 *
 * Both calls derive from one idempotency key, so a retry after a network blip
 * can never produce two holds or two charges for the same slot. Both mutations
 * also invalidate the booking lists, which is what makes a released slot vanish
 * from the availability grid.
 */
export function useCreateHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      input,
      idempotencyKey,
    }: {
      input: CreateHoldInput;
      idempotencyKey: string;
    }): Promise<CreateHoldResult> => {
      const { booking } = await bookingApi.createHold(input, idempotencyKey);

      try {
        const payment = await paymentApi.createAttempt(booking._id, `${idempotencyKey}-payment`);
        return { booking, payment };
      } catch {
        // The hold is still valid when the payment provider is unreachable, so
        // the hold is returned and the checkout explains payment is still due.
        return { booking, payment: null };
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}

/** Convert a paid hold into a confirmed booking. */
export function useConfirmHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => bookingApi.confirmHold(bookingId),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.setQueryData(queryKeys.bookings.detail(result.booking._id), result);
    },
  });
}

/**
 * Cancel a booking. Invalidating the venue keys as well is what makes the freed
 * slot reappear in availability queries.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, reason, idempotencyKey }: { bookingId: string; reason: string; idempotencyKey?: string }) =>
      bookingApi.cancel(bookingId, { reason, idempotencyKey }),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.all() });
      void queryClient.setQueryData(queryKeys.bookings.detail(result.booking._id), result);
    },
  });
}
