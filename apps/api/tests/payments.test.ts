import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { config } from '../src/config';
import { PaymentAttemptModel } from '../src/models/payments.model';
import {
  DevelopmentMockPaymentProvider,
  getPaymentProvider,
} from '../src/services/paymentProvider.service';
import {
  paymentMatchesSnapshot,
  reconcilePendingPayments,
  statusForEvent,
} from '../src/services/payments.service';
import { ApiError } from '../src/utils/api-error';

const event = {
  eventId: 'evt-1',
  eventType: 'payment.succeeded' as const,
  providerPaymentId: 'pay-1',
  bookingId: 'booking-1',
  amountMinor: 1200,
  currency: 'INR',
};

const signed = (payload: unknown) => {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    body,
    signature: createHmac('sha256', config.payments.webhookSecret).update(body).digest('hex'),
  };
};

describe('development payment adapter', () => {
  it('accepts a valid raw-body signature and parses the event', () => {
    const provider = new DevelopmentMockPaymentProvider();
    expect(provider.verifyWebhook(signed(event).body, signed(event).signature)).toEqual(event);
  });

  it('rejects invalid signatures before parsing provider data', () => {
    const provider = new DevelopmentMockPaymentProvider();
    expect(() =>
      provider.verifyWebhook(Buffer.from(JSON.stringify(event)), 'bad-signature')
    ).toThrow('Invalid payment webhook signature');
  });

  it('rejects a missing signature and an incomplete payload', () => {
    const provider = new DevelopmentMockPaymentProvider();

    expect(() => provider.verifyWebhook(Buffer.from(JSON.stringify(event)), undefined)).toThrow(
      'Payment webhook signature is required'
    );

    const partial = signed({ eventId: 'evt-2' });
    expect(() => provider.verifyWebhook(partial.body, partial.signature)).toThrow(
      'Incomplete payment webhook payload'
    );
  });

  it('creates pending development attempts and never returns card data', async () => {
    const result = await new DevelopmentMockPaymentProvider().createPayment({
      amountMinor: 1200,
      currency: 'INR',
      bookingId: 'booking-1',
      idempotencyKey: 'attempt-1',
    });

    expect(result.status).toBe('pending');
    expect(result.developmentOnly).toBe(true);
    expect(result).not.toHaveProperty('card');
    expect(result).not.toHaveProperty('secret');
  });

  it('is the configured provider only when a provider is selected', () => {
    expect(getPaymentProvider().name).toBe('development_mock');
  });

  it('surfaces a typed error when no provider is configured', () => {
    const previous = config.payments.provider;
    config.payments.provider = 'unselected';

    try {
      expect(() => getPaymentProvider()).toThrow(ApiError);
      expect(() => getPaymentProvider()).toThrow(/PAYMENT_PROVIDER_NOT_CONFIGURED|No payment provider/);
    } finally {
      config.payments.provider = previous;
    }
  });
});

describe('payment outcome mapping', () => {
  it('maps provider failures and uncertain outcomes without conflating booking status', () => {
    expect(statusForEvent('payment.succeeded')).toBe('paid');
    expect(statusForEvent('payment.failed')).toBe('failed');
    expect(statusForEvent('payment.uncertain')).toBe('uncertain');
  });

  it('rejects amount or currency mismatches against the trusted snapshot', () => {
    expect(
      paymentMatchesSnapshot({ amountMinor: 1200, currency: 'INR' }, { amountMinor: 1200, currency: 'inr' })
    ).toBe(true);
    expect(
      paymentMatchesSnapshot({ amountMinor: 1200, currency: 'INR' }, { amountMinor: 1199, currency: 'INR' })
    ).toBe(false);
    expect(
      paymentMatchesSnapshot({ amountMinor: 1200, currency: 'INR' }, { amountMinor: 1200, currency: 'USD' })
    ).toBe(false);
  });
});

describe('payment reconciliation', () => {
  it('marks long-pending attempts as uncertain', async () => {
    const updateMany = vi
      .spyOn(PaymentAttemptModel, 'updateMany')
      .mockResolvedValue({ modifiedCount: 2 } as never);
    vi.spyOn(PaymentAttemptModel, 'find').mockReturnValue({
      distinct: vi.fn().mockResolvedValue([]),
    } as never);

    await expect(reconcilePendingPayments()).resolves.toEqual({ markedUncertain: 2 });
    expect(updateMany).toHaveBeenCalledOnce();
  });
});