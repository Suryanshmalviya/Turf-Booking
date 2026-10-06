import type { Request, Response } from 'express';

import {
  changePassword,
  getProfile,
  getVenueAssignments,
  listSessions,
  listUsers,
  revokeSessionById,
  updateProfile,
} from '../services/users.service';
import type { PaginationInput } from '../types/pagination';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';

export const profile = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, { user: await getProfile(request.user!.sub) });
});

export const updateMe = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, {
    user: await updateProfile(request.user!.sub, request.body as Parameters<typeof updateProfile>[1]),
  });
});

export const password = asyncHandler(async (request: Request, response: Response) => {
  sendCreated(
    response,
    await changePassword(request.user!.sub, request.body as Parameters<typeof changePassword>[1])
  );
});

export const sessions = asyncHandler(async (request: Request, response: Response) => {
  const { page, limit } = request.query as unknown as PaginationInput;
  const result = await listSessions(request.user!.sub, page, limit);
  sendSuccess(response, result.items, { meta: result.meta });
});

export const revokeSession = asyncHandler(async (request: Request, response: Response) => {
  await revokeSessionById(request.user!.sub, request.params.sessionId);
  sendNoContent(response);
});

export const directory = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, await listUsers(request.query as unknown as Parameters<typeof listUsers>[0]));
});

export const byId = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, { user: await getProfile(request.params.userId) });
});

export const assignments = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, { assignments: await getVenueAssignments(request.user!.sub) });
});