import type { Request, Response } from 'express';

import {
  cancelBooking,
  confirmBookingHold,
  createBookingHold,
  getBookingForUser,
  listBookings,
} from '../services/bookings.service';
import { requestRefund } from '../services/payments.service';
import { sendAccepted, sendCreated, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import { requireIdempotencyKey } from '../utils/request';
import type {
  CancelBookingBody,
  CreateHoldBody,
  ListMyBookingsQuery,
  RefundRequestBody,
} from '../validators/bookings.validator';

export const listMine = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as ListMyBookingsQuery;
  const result = await listBookings({ ...query, userId: request.user!.sub });
  sendSuccess(response, result.items, { meta: result.meta });
});

export const getMine = asyncHandler(async (request: Request, response: Response) => {
  const booking = await getBookingForUser(request.user!.sub, request.params.bookingId);
  sendSuccess(response, { booking });
});

export const createHold = asyncHandler(async (request: Request, response: Response) => {
  const body = request.body as CreateHoldBody;
  const booking = await createBookingHold({
    ...body,
    idempotencyKey: requireIdempotencyKey(request),
    userId: request.user!.sub,
  });

  sendCreated(response, { booking });
});

export const confirmHold = asyncHandler(async (request: Request, response: Response) => {
  const booking = await confirmBookingHold(request.user!.sub, request.params.bookingId);
  sendSuccess(response, { booking });
});

export const cancel = asyncHandler(async (request: Request, response: Response) => {
  const booking = await cancelBooking({
    bookingId: request.params.bookingId,
    actor: request.user!,
    reason: (request.body as CancelBookingBody).reason,
    idempotencyKey: (request.body as CancelBookingBody).idempotencyKey,
  });

  sendSuccess(response, { booking });
});

/** Booking-scoped refund entry point; delegates to the payments module. */
export const refund = asyncHandler(async (request: Request, response: Response) => {
  const refund = await requestRefund({
    ...(request.body as RefundRequestBody),
    bookingId: request.params.bookingId,
  });

  sendAccepted(response, { refund });
});