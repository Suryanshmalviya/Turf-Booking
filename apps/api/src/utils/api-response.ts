import type { Response } from 'express';

import type { ApiFailureBody, ApiSuccessBody } from '../types/api';
import type { PaginationMeta } from '../types/pagination';

export interface SendOptions {
  status?: number;
  meta?: PaginationMeta;
}

function currentRequestId(response: Response): string | undefined {
  const header = response.getHeader('X-Request-ID');
  return typeof header === 'string' ? header : undefined;
}

/**
 * Single success exit point for every controller. Guarantees the documented
 * envelope `{ success, data, meta?, requestId }` across the whole API surface.
 */
export function sendSuccess<TData>(
  response: Response,
  data: TData,
  options: SendOptions = {}
): void {
  const body: ApiSuccessBody<TData> = { success: true, data };

  const requestId = currentRequestId(response);
  if (requestId) body.requestId = requestId;
  if (options.meta) body.meta = options.meta;

  response.status(options.status ?? 200).json(body);
}

export function sendCreated<TData>(
  response: Response,
  data: TData,
  options: Omit<SendOptions, 'status'> = {}
): void {
  sendSuccess(response, data, { ...options, status: 201 });
}

/** For work accepted for asynchronous processing (e.g. a refund request). */
export function sendAccepted<TData>(
  response: Response,
  data: TData,
  options: Omit<SendOptions, 'status'> = {}
): void {
  sendSuccess(response, data, { ...options, status: 202 });
}

export function sendNoContent(response: Response): void {
  response.status(204).end();
}

export function sendFailure(
  response: Response,
  status: number,
  body: Omit<ApiFailureBody, 'success'>
): void {
  response.status(status).json({ success: false, ...body });
}