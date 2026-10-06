import type { Request, Response } from 'express';

import { listCourtAvailability } from '../services/bookings.service';
import * as courtService from '../services/courts.service';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import type {
  AvailabilityQuery,
  CalendarQuery,
  CreateAvailabilityExceptionBody,
  CreateAvailabilityRuleBody,
  CreatePriceRuleBody,
  ListCourtsQuery,
} from '../validators/courts.validator';
import * as reviewsController from './reviews.controller';

// ---- public reads

export const list = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await courtService.listCourts(request.query as unknown as ListCourtsQuery));
});

export const detail = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await courtService.getPublicCourt(request.params.venueId));
});

export const schedule = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await courtService.listCourtSchedule(request.params.venueId));
});

export const availability = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as AvailabilityQuery;
  const intervals = await listCourtAvailability(
    request.params.venueId,
    request.params.pitchId,
    query.date,
    query.durationMinutes
  );

  sendSuccess(response, { intervals });
});

export const reviews = reviewsController.list;
export const rating = reviewsController.summary;

// ---- venue management

export const create = asyncHandler(async (request: Request, response: Response) => {
  const venue = await courtService.createCourt(
    request.user!.sub,
    request.body as unknown as Record<string, unknown>
  );
  sendCreated(response, { venue });
});

export const update = asyncHandler(async (request: Request, response: Response) => {
  const venue = await courtService.updateCourt(
    request.params.venueId,
    request.user!,
    request.body as unknown as Record<string, unknown>
  );
  sendSuccess(response, { venue });
});

export const review = asyncHandler(async (request: Request, response: Response) => {
  const venue = await courtService.reviewCourt({
    venueId: request.params.venueId,
    actorId: request.user!.sub,
    status: request.params.action as 'active' | 'rejected' | 'suspended',
    reason: request.body.reason as string,
    requestId: request.requestId,
  });

  sendSuccess(response, { venue });
});

// ---- courts (pitches) inside a venue

export const createPitch = asyncHandler(async (request: Request, response: Response) => {
  const pitch = await courtService.addPitch(
    request.params.venueId,
    request.body as unknown as Record<string, unknown>
  );
  sendCreated(response, { pitch });
});

export const updatePitch = asyncHandler(async (request: Request, response: Response) => {
  const pitch = await courtService.updatePitch(
    request.params.venueId,
    request.params.pitchId,
    request.body as unknown as Record<string, unknown>
  );
  sendSuccess(response, { pitch });
});

export const deletePitch = asyncHandler(async (request: Request, response: Response) => {
  await courtService.deactivatePitch(request.params.venueId, request.params.pitchId);
  sendNoContent(response);
});

// ---- operating hours, exceptions and pricing

export const createRule = asyncHandler(async (request: Request, response: Response) => {
  const rule = await courtService.createAvailabilityRule(
    request.params.venueId,
    request.body as unknown as CreateAvailabilityRuleBody
  );
  sendCreated(response, { rule });
});

export const createException = asyncHandler(async (request: Request, response: Response) => {
  const exception = await courtService.createAvailabilityException(
    request.params.venueId,
    request.body as unknown as CreateAvailabilityExceptionBody
  );
  sendCreated(response, { exception });
});

export const createPrice = asyncHandler(async (request: Request, response: Response) => {
  const priceRule = await courtService.createPriceRule(
    request.params.venueId,
    request.body as unknown as CreatePriceRuleBody
  );
  sendCreated(response, { priceRule });
});

// ---- operator views

export const calendar = asyncHandler(async (request: Request, response: Response) => {
  const query = request.query as unknown as CalendarQuery;
  const result = await courtService.listVenueCalendar({
    venueId: request.params.venueId,
    actor: request.user!,
    from: query.from,
    to: query.to,
  });

  sendSuccess(response, { bookings: result.items }, { meta: result.meta });
});

export const blackout = asyncHandler(async (request: Request, response: Response) => {
  const exception = await courtService.operatorBlackout({
    venueId: request.params.venueId,
    actor: request.user!,
    date: new Date(request.body.date as string),
    reason: request.body.reason as string,
  });

  sendCreated(response, { exception });
});