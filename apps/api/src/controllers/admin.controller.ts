import type { Request, Response } from 'express';

import type { AdminBookingQuery, AdminPageQuery, AdminVenueInput } from '../services/admin.service';
import {
  bookingPaymentView,
  createVenueWithCourt,
  databaseHealth,
  exportBookings,
  operationalReport,
  processNotificationsBatch,
  searchBookings,
  searchUsers,
  searchVenues,
  seedDemoData,
  updateUserRoleOrStatus,
  venueAction,
  venueReviewQueue,
} from '../services/admin.service';
import type { VenueStatus } from '../types/enums';
import type { DateRangeQuery } from '../types/pagination';
import { sendCreated, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import type { AdminUpdateUserBody } from '../validators/admin.validator';

export const database = asyncHandler(async (_request: Request, response: Response) => {
  sendSuccess(response, await databaseHealth());
});

export const seed = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await seedDemoData(request.user!.sub));
});

export const venueQueue = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as AdminPageQuery & { status?: VenueStatus };
  sendSuccess(response, await venueReviewQueue(query));
});

export const users = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as AdminPageQuery & { q?: string };
  sendSuccess(response, await searchUsers(query));
});

export const updateUser = asyncHandler(async (request: Request, response: Response) => {
  const body = request.body as AdminUpdateUserBody;
  sendSuccess(response, {
    user: await updateUserRoleOrStatus({
      userId: request.params.userId,
      actorId: request.user!.sub,
      role: body.role,
      status: body.status,
    }),
  });
});

export const venues = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as AdminPageQuery & {
    q?: string;
    status?: VenueStatus;
  };
  sendSuccess(response, await searchVenues(query));
});

export const createVenue = asyncHandler(async (request: Request, response: Response) => {
  sendCreated(
    response,
    await createVenueWithCourt(
      request.user!.sub,
      request.body as unknown as AdminVenueInput,
      request.requestId
    )
  );
});

export const bookings = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await searchBookings(request.query as unknown as AdminBookingQuery));
});

export const bookingPayments = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await bookingPaymentView(request.params.bookingId));
});

export const report = asyncHandler(async (request: Request, response: Response) => {
  const { from, to } = request.query as unknown as DateRangeQuery;
  sendSuccess(response, await operationalReport({ from, to }));
});

export const exportBookingRows = asyncHandler(async (request: Request, response: Response) => {
  const { from, to } = request.query as unknown as DateRangeQuery;
  sendSuccess(response, { rows: await exportBookings({ from, to }) });
});

export const action = asyncHandler(async (request: Request, response: Response) => {
  const venue = await venueAction({
    venueId: request.params.venueId,
    actorId: request.user!.sub,
    requestId: request.requestId,
    status: request.params.action as 'active' | 'rejected' | 'suspended',
    reason: request.body.reason as string,
  });

  sendSuccess(response, { venue });
});

export const processNotifications = asyncHandler(async (_request: Request, response: Response) => {
  sendSuccess(response, await processNotificationsBatch());
});
