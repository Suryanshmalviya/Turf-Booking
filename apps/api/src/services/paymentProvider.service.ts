import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from '../config';
import { ApiError } from '../utils/api-error';

export interface PaymentCreateInput {
  amountMinor: number;
  currency: string;
  bookingId: string;
  idempotencyKey: string;
}

export interface PaymentCreateResult {
  provider: string;
  providerPaymentId: string;
  status: 'pending';
  developmentOnly: boolean;
}

export interface RefundCreateInput {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}

export interface RefundCreateResult {
  providerRefundId: string;
  status: 'processing';
  developmentOnly: boolean;
}

export interface VerifiedPaymentEvent {
  eventId: string;
  eventType:
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.uncertain'
    | 'refund.succeeded'
    | 'refund.failed';
  providerPaymentId: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  failureCode?: string;
  uncertainReason?: string;
}

export type PaymentWebhookSignatureHeader = 'payment-signature' | 'stripe-signature';

/**
 * Provider boundary. The service layer depends only on this contract, so a real
 * PSP adapter can replace the development mock without touching business logic.
 */
export interface PaymentProviderAdapter {
  readonly name: string;
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  createRefund(input: RefundCreateInput): Promise<RefundCreateResult>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): VerifiedPaymentEvent;
}

/**
 * Offline adapter used for local development and tests. It never contacts a
 * network and marks every result as `developmentOnly` so callers can refuse to
 * treat it as a real capture.
 */
export class DevelopmentMockPaymentProvider implements PaymentProviderAdapter {
  public readonly name = 'development_mock';

  public async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    return {
      provider: this.name,
      providerPaymentId: `dev_${input.bookingId}_${input.idempotencyKey}`,
      status: 'pending',
      developmentOnly: true,
    };
  }

  public async createRefund(input: RefundCreateInput): Promise<RefundCreateResult> {
    return {
      providerRefundId: `dev_refund_${input.providerPaymentId}_${input.idempotencyKey}`,
      status: 'processing',
      developmentOnly: true,
    };
  }

  public verifyWebhook(rawBody: Buffer, signature: string | undefined): VerifiedPaymentEvent {
    if (!config.payments.webhookSecret) {
      throw ApiError.serviceUnavailable(
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
        'Development mock webhook secret is not configured'
      );
    }
    if (!signature) throw ApiError.badRequest('Payment webhook signature is required');

    const expected = createHmac('sha256', config.payments.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const provided = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      throw ApiError.unauthorized('Invalid payment webhook signature');
    }

    let event: VerifiedPaymentEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as VerifiedPaymentEvent;
    } catch {
      throw ApiError.badRequest('Invalid payment webhook payload');
    }

    if (!event.eventId || !event.providerPaymentId || !event.bookingId || !event.amountMinor || !event.currency) {
      throw ApiError.badRequest('Incomplete payment webhook payload');
    }

    return event;
  }
}

export function getPaymentProvider(): PaymentProviderAdapter {
  if (config.payments.provider === 'development_mock') return new DevelopmentMockPaymentProvider();
  throw ApiError.serviceUnavailable(
    'PAYMENT_PROVIDER_NOT_CONFIGURED',
    'No payment provider is selected. Configure PAYMENT_PROVIDER before accepting payments.'
  );
}