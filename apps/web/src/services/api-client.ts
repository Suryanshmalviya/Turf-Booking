import type { ApiEnvelope, ApiResult, PaginationMeta, RequestOptions } from '../types/api';
import { getCsrfToken } from '../utils/csrf';
import { ApiError } from '../utils/error';

/**
 * The single place the browser talks to the API.
 *
 * Everything the app needs from the network goes through here: base URL and
 * credentials, the CSRF double-submit header, timeouts, envelope unwrapping,
 * error normalisation, and the silent token refresh. Feature code never calls
 * `fetch` directly, so no request can accidentally skip error handling — and the
 * browser only ever talks to the backend API, never to a database.
 */

/** Same-origin by default (Vite dev proxy); override for split-origin deployments. */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

/** Header the API expects the CSRF cookie to be echoed in. */
const CSRF_HEADER_NAME = import.meta.env.VITE_CSRF_HEADER_NAME ?? 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Endpoints that must never trigger the refresh cycle: they either establish the
 * session, end it, or are the refresh itself.
 */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/register', '/auth/logout', '/auth/refresh']);

const DEFAULT_TIMEOUT_MS = 20_000;

const NETWORK_ERROR_BODY = {
  code: 'NETWORK_ERROR',
  message: 'Cannot reach the server. Check your connection and try again.',
} as const;

const TIMEOUT_ERROR_BODY = {
  code: 'TIMEOUT',
  message: 'The request took too long to complete. Please try again.',
} as const;

export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

function parseEnvelope<T>(rawText: string): ApiEnvelope<T> | null {
  if (!rawText.trim()) return null;
  try {
    return JSON.parse(rawText) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

/**
 * Combines the caller's signal with a timeout. `AbortSignal.any` is not available
 * in every runtime this app targets, so the plumbing is done by hand.
 */
function withTimeout(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener('abort', onExternalAbort);
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** One fetch round trip: build the request, parse the envelope, throw on failure. */
async function send<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);

  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);

  const timeout = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      // Sessions live in HttpOnly cookies, so they must ride along on every call.
      credentials: 'include',
      signal: timeout.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (timeout.didTimeOut()) {
      throw new ApiError(0, { ...TIMEOUT_ERROR_BODY }, 'The request timed out');
    }
    // A caller-driven abort is not a failure: re-throw it untouched so query
    // cancellation stays distinguishable from an error state.
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, { ...NETWORK_ERROR_BODY }, 'Cannot reach the server');
  } finally {
    timeout.dispose();
  }

  const requestId = response.headers.get('X-Request-Id') ?? undefined;

  // 204 No Content has no body — don't try to parse JSON.
  if (response.status === 204) return { data: undefined as T, requestId };

  const rawText = await response.text();
  const payload = parseEnvelope<T>(rawText);

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      response.status,
      payload?.error ?? { message: rawText.slice(0, 150) || undefined },
      `Request failed with status ${response.status}`,
      requestId ?? payload?.requestId
    );
  }

  if (payload === null) {
    throw new ApiError(
      response.status,
      { code: 'INVALID_RESPONSE', message: 'The server returned an unreadable response' },
      'Invalid response from server',
      requestId
    );
  }

  return {
    data: payload.data as T,
    meta: payload.meta as PaginationMeta | undefined,
    requestId: requestId ?? payload.requestId,
  };
}

/* -------------------------------------------------------------------------- */
/* Silent session refresh                                                      */
/* -------------------------------------------------------------------------- */

type SessionExpiredHandler = () => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Registers what should happen when a refresh fails and the session is
 * definitively gone. Returns an unsubscribe function.
 */
export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandler = handler;
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = null;
  };
}

/**
 * Rotates the session once, no matter how many requests hit a 401 at the same
 * time. Concurrent callers all await the same promise, so a burst of expired
 * queries produces exactly one refresh call instead of a stampede.
 */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = send<unknown>('/auth/refresh', { method: 'POST' })
      .then(() => true)
      .catch(() => {
        sessionExpiredHandler?.();
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * A request may only be replayed after a refresh when doing so is safe: reads,
 * or writes that carry an `Idempotency-Key` so the server can collapse a
 * duplicate. Everything else surfaces the 401 to the caller.
 */
function isReplayable(options: RequestOptions): boolean {
  if (SAFE_METHODS.has(options.method ?? 'GET')) return true;
  return Boolean(options.idempotencyKey);
}

function shouldAttemptRefresh(path: string, options: RequestOptions): boolean {
  if (options.retryAfterRefresh === false) return false;
  if (options.retryAfterRefresh === true) return true;
  return !NO_REFRESH_PATHS.has(path.split('?')[0]);
}

/**
 * Performs a request, transparently refreshing an expired access token once.
 *
 * `retryAfterRefresh` (the flag, not the option) guarantees a replay can never
 * loop: the second attempt is sent verbatim.
 */
async function apiRequest<T>(path: string, options: RequestOptions = {}, retried = false) {
  try {
    return await send<T>(path, options);
  } catch (error) {
    const sessionExpired = error instanceof ApiError && error.status === 401;

    if (!sessionExpired || retried || !shouldAttemptRefresh(path, options) || !isReplayable(options)) {
      throw error;
    }

    if (await refreshSession()) {
      return send<T>(path, { ...options, retryAfterRefresh: false });
    }

    throw error;
  }
}

/** Request returning the payload's `data`, discarding pagination metadata. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await apiRequest<T>(path, options);
  return data;
}

/** Request returning `data` together with the envelope's `meta` block. */
export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, options);
}

/** Verb helpers so call sites read as `apiClient.get('/courts')`. */
export const apiClient = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/** Test seam: drops any in-flight refresh bookkeeping. */
export function resetApiClientState(): void {
  refreshInFlight = null;
  sessionExpiredHandler = null;
}

export { API_BASE_URL, CSRF_HEADER_NAME };
