import { useMutation } from '@tanstack/react-query';

import { paymentApi } from '../services/payment.api';

/**
 * Payment attempts. Only the customer-scoped endpoint is exposed; the provider
 * webhook is server-to-server and reconciliation is an admin operation handled by
 * the admin API.
 */
export function useCreatePaymentAttempt() {
  return useMutation({
    mutationFn: ({ bookingId, idempotencyKey }: { bookingId: string; idempotencyKey: string }) =>
      paymentApi.createAttempt(bookingId, idempotencyKey),
  });
}
