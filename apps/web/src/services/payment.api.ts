import type { PaymentAttemptResult } from '../types/booking';
import { request } from './api-client';

/** Payment attempts for a booking. The provider webhook never comes through here. */

export interface ReconcileResult {
  processed: number;
  updated?: number;
  [key: string]: unknown;
}

export const paymentApi = {
  /**
   * Start a payment attempt for a held booking.
   *
   * `idempotencyKey` is mandatory on the server, and reusing it means a retry
   * after a dropped connection returns the original attempt instead of charging
   * twice.
   */
  createAttempt(bookingId: string, idempotencyKey: string) {
    return request<PaymentAttemptResult>(`/payments/bookings/${bookingId}/attempts`, {
      method: 'POST',
      body: {},
      idempotencyKey,
    });
  },

  /** Admin only: re-drive attempts the provider has not confirmed. */
  reconcile() {
    return request<ReconcileResult>('/payments/reconcile', { method: 'POST' });
  },
};
