import type { Request, Response } from 'express';

import { sendSuccess } from '../utils/api-response';
import { asyncHandler } from '../utils/async-handler';
import { buildHealthReport } from '../validators/health.validator';

export const healthCheck = asyncHandler(async (request: Request, response: Response) => {
  sendSuccess(response, buildHealthReport(false));
});

export const detailedHealthCheck = asyncHandler(async (_request: Request, response: Response) => {
  sendSuccess(response, buildHealthReport(true));
});
