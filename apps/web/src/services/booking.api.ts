import type { Booking, BookingListQuery, CreateHoldInput } from '../types/booking';
import { newIdempotencyKey } from '../utils/id';
import { buildQuery, request, requestWithMeta } from './api-client';

/**
 * Booking lifecycle: a short-lived hold reserves the slot, then payment confirms
 * it. List endpoints put their rows in `data` and pagination in `meta`, so both
 * are folded into one result here for the hooks to consume.
 */

export interface BookingListResult {
  items: Booking[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface CancelBookingInput {
  reason: string;
  idempotencyKey?: string;
}

export const bookingApi = {
  /** The caller's own bookings, with server-side filtering and pagination. */
  async listMine(query: BookingListQuery = {}, signal?: AbortSignal): Promise<BookingListResult> {
    const { data, meta } = await requestWithMeta<Booking[]>(
      `/bookings${buildQuery({ ...query })}`,
      {
        signal,
      }
    );

    return {
      items: data ?? [],
      total: meta?.total ?? 0,
      page: meta?.page ?? 1,
      limit: meta?.limit ?? data?.length ?? 0,
      hasNextPage: meta?.hasNextPage ?? false,
    };
  },

  detail(bookingId: string, signal?: AbortSignal) {
    return request<{ booking: Booking }>(`/bookings/${bookingId}`, { signal });
  },

  /**
   * Reserve a slot. `idempotencyKey` must be stable across retries so a double
   * submit can never create two holds — the server collapses duplicates on it.
   */
  createHold(input: CreateHoldInput, idempotencyKey: string) {
    return request<{ booking: Booking }>('/holds', {
      method: 'POST',
      body: input,
      idempotencyKey,
    });
  },

  /** Turn a paid hold into a confirmed booking. */
  confirmHold(bookingId: string) {
    return request<{ booking: Booking }>(`/holds/${bookingId}/confirm`, { method: 'POST' });
  },

  /**
   * Customer cancellation. Operator cancellations go through the admin API.
   *
   * `cancelBookingSchema` on the server requires `idempotencyKey` in the body, so
   * it is sent in both the body and the header. Reusing the key means a retry
   * after a dropped connection cannot cancel or refund the booking twice.
   */
  cancel(bookingId: string, input: CancelBookingInput) {
    const idempotencyKey = input.idempotencyKey ?? newIdempotencyKey('cancel');

    return request<{ booking: Booking }>(`/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: { reason: input.reason, idempotencyKey },
      idempotencyKey,
    });
  },
};
