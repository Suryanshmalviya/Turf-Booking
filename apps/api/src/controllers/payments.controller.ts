import type { Request, Response } from 'express';

import {
  createPaymentAttempt,
  processPaymentWebhook,
  reconcilePendingPayments,
} from '../services/payments.service';
import { ApiError } from '../utils/api-error';
import { sendCreated, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import { requireIdempotencyKey } from '../utils/request';

export const createAttempt = asyncHandler(async (request: Request, response: Response) => {
  const result = await createPaymentAttempt({
    userId: request.user!.sub,
    bookingId: request.params.bookingId,
    idempotencyKey: requireIdempotencyKey(request),
  });

  sendCreated(response, {
    attempt: result.attempt,
    developmentOnly: result.developmentOnly,
  });
});

/**
 * Unauthenticated provider callback: authenticity comes from the raw-body
 * signature check inside the payments service, not from a session.
 */
export const webhook = asyncHandler(async (request: Request, response: Response) => {
  if (!request.rawBody) throw ApiError.badRequest('Raw payment webhook body is required');

  const result = await processPaymentWebhook(
    request.rawBody,
    request.header('payment-signature') ?? request.header('stripe-signature')
  );

  sendSuccess(response, result);
});

export const reconcile = asyncHandler(async (_request: Request, response: Response) => {
  sendSuccess(response, await reconcilePendingPayments());
});