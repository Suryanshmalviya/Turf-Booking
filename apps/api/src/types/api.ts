import type { PaginationMeta } from './pagination';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccessBody<TData> {
  success: true;
  data: TData;
  meta?: PaginationMeta;
  requestId?: string;
}

export interface ApiFailureBody {
  success: false;
  error: ApiErrorBody;
  requestId?: string;
}

export type ApiResponse<TData> = ApiSuccessBody<TData> | ApiFailureBody;

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface PaginatedData<TItem> {
  items: TItem[];
  total: number;
  page: number;
  limit: number;
}