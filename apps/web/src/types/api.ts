/**
 * Envelope shapes returned by the API. Every successful response is wrapped in
 * `{ success: true, data }` and every failure in `{ success: false, error }`.
 */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

/** Pagination block emitted by `paginationMeta` in `apps/api`. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: PaginationMeta;
  requestId?: string;
}

/**
 * What `apiRequest` resolves to. List endpoints put their rows in `data` and the
 * pagination block in `meta`, so both have to survive the envelope unwrap.
 */
export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

/** Minimal options bag accepted by the fetch wrapper. */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Send an `Idempotency-Key` header for retry-safe mutations. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Abort the request after this many milliseconds. Defaults to the client default. */
  timeoutMs?: number;
  /** Set to false to opt a request out of the automatic 401 -> refresh -> replay cycle. */
  retryAfterRefresh?: boolean;
}
