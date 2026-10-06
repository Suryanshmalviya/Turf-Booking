import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_BASE_URL,
  buildQuery,
  onSessionExpired,
  request,
  requestWithMeta,
  resetApiClientState,
} from '../src/services/api-client';
import { ApiError } from '../src/utils/error';

/**
 * The API client is the only place the browser talks to the backend, so it is
 * tested at the wire: what goes out, what comes back, and how failures are
 * classified. `fetch` is replaced, never the client itself.
 */

interface FakeResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function jsonResponse({ status, body, headers }: FakeResponse) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers?.[name] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

/** Resolves or rejects the queued responses in order, recording every call. */
function stubFetch(...queue: Array<FakeResponse | Error>) {
  const calls: Array<{ url: string; init: RequestInit & { headers: Headers } }> = [];

  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init: init as { headers: Headers } });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    if (next instanceof Error) throw next;
    return jsonResponse(next);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function success(data: unknown, meta?: unknown, headers?: Record<string, string>): FakeResponse {
  return { status: 200, body: { success: true, data, ...(meta ? { meta } : {}) }, headers };
}

function failure(status: number, error: unknown, headers?: Record<string, string>): FakeResponse {
  return { status, body: { success: false, error }, headers };
}

const meta = { page: 1, limit: 20, total: 3, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

beforeEach(() => {
  resetApiClientState();
  // The CSRF cookie is readable by design; clear it so header assertions are exact.
  document.cookie = 'pb_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request envelope', () => {
  it('unwraps a successful response', async () => {
    stubFetch(success({ user: { id: 'user-1' } }));

    await expect(request<{ user: { id: string } }>('/auth/me')).resolves.toEqual({
      user: { id: 'user-1' },
    });
  });

  it('keeps pagination metadata next to the rows', async () => {
    stubFetch(success([{ _id: 'a' }, { _id: 'b' }], meta));

    const result = await requestWithMeta<Array<{ _id: string }>>('/bookings');

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual(meta);
  });

  it('treats 204 as an empty success rather than a parse error', async () => {
    stubFetch({ status: 204 });

    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('surfaces the request id the server reports', async () => {
    stubFetch(success({}, undefined, { 'X-Request-Id': 'req-42' }));

    const result = await requestWithMeta('/health');

    expect(result.requestId).toBe('req-42');
  });

  it('builds query strings and drops empty values', () => {
    expect(buildQuery({ page: 2, q: 'court', city: '', missing: undefined, flag: false })).toBe(
      '?page=2&q=court'
    );
    expect(buildQuery({})).toBe('');
  });
});

describe('error classification', () => {
  it('maps the error envelope onto ApiError', async () => {
    stubFetch(
      failure(409, { code: 'CONFLICT', message: 'An account with this email already exists' })
    );

    const error = await request('/auth/register', { method: 'POST', body: {} }).catch(
      caught => caught as ApiError
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('An account with this email already exists');
  });

  it('keeps validation details for field-level messages', async () => {
    stubFetch(
      failure(400, {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'body.email', message: 'Enter a valid email address' }],
      })
    );

    const error = (await request('/auth/login', { method: 'POST', body: {} }).catch(
      caught => caught
    )) as ApiError;

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([
      { field: 'body.email', message: 'Enter a valid email address' },
    ]);
  });

  it('normalises an unreachable server into a network error', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    const error = (await request('/courts').catch(caught => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toMatch(/cannot reach the server/i);
  });

  it('reports a timeout distinctly from a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );

    const error = (await request('/courts', { timeoutMs: 5 }).catch(caught => caught)) as ApiError;

    expect(error.code).toBe('TIMEOUT');
    expect(error.status).toBe(0);
  });

  it('lets a caller-initiated abort through untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );

    const controller = new AbortController();
    const pending = request('/courts', { signal: controller.signal }).catch(caught => caught);
    controller.abort();

    const error = await pending;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });

  it('rejects an unreadable success body instead of returning undefined', async () => {
    stubFetch({ status: 200, body: undefined });

    const error = (await request('/courts').catch(caught => caught)) as ApiError;

    expect(error.code).toBe('INVALID_RESPONSE');
  });
});

describe('request shape', () => {
  it('targets the API base URL with credentials attached', async () => {
    const { calls } = stubFetch(success({}));

    await request('/courts');

    expect(calls[0].url).toBe(`${API_BASE_URL}/courts`);
    expect(calls[0].init.credentials).toBe('include');
  });

  it('serialises the body and sets the content type only when there is one', async () => {
    const { calls } = stubFetch(success({}), success({}));

    await request('/auth/login', { method: 'POST', body: { email: 'a@b.com' } });
    await request('/courts');

    expect(calls[0].init.headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].init.body).toBe(JSON.stringify({ email: 'a@b.com' }));
    expect(calls[1].init.headers.get('Content-Type')).toBeNull();
    expect(calls[1].init.body).toBeUndefined();
  });

  it('echoes the CSRF cookie on unsafe methods only', async () => {
    document.cookie = 'pb_csrf=csrf-value';
    const { calls } = stubFetch(success({}), success({}));

    await request('/bookings');
    await request('/bookings', { method: 'POST', body: {} });

    expect(calls[0].init.headers.get('X-CSRF-Token')).toBeNull();
    expect(calls[1].init.headers.get('X-CSRF-Token')).toBe('csrf-value');
  });

  it('passes an idempotency key through for retry-safe writes', async () => {
    const { calls } = stubFetch(success({}));

    await request('/holds', { method: 'POST', body: {}, idempotencyKey: 'hold-1' });

    expect(calls[0].init.headers.get('Idempotency-Key')).toBe('hold-1');
  });
});

describe('silent token refresh', () => {
  it('refreshes once and replays the original request after a 401', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' }),
      // The refresh itself succeeds and rotates the cookies.
      success({ user: { id: 'user-1' } }),
      // The replayed read now succeeds.
      success({ items: [] })
    );

    await expect(request('/bookings')).resolves.toEqual({ items: [] });

    expect(calls.map(call => call.url)).toEqual([
      `${API_BASE_URL}/bookings`,
      `${API_BASE_URL}/auth/refresh`,
      `${API_BASE_URL}/bookings`,
    ]);
    expect(calls[1].init.method).toBe('POST');
  });

  it('collapses a burst of 401s into a single refresh', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' }),
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' }),
      success({}, undefined, { 'X-Request-Id': 'req-refresh' }),
      success({ ok: 1 }),
      success({ ok: 2 })
    );

    await Promise.all([request('/bookings'), request('/notifications')]);

    const refreshCalls = calls.filter(call => call.url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('never refreshes for the credential endpoints themselves', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Invalid email or password' })
    );

    await expect(
      request('/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'x' } })
    ).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/auth/login');
  });

  it('does not replay a write that is not idempotency-protected', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' })
    );

    await expect(request('/bookings', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
  });

  it('does replay an idempotency-protected write', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' }),
      success({}, undefined, { 'X-Request-Id': 'req-refresh' }),
      success({ booking: { _id: 'booking-1' } })
    );

    await expect(
      request('/holds', { method: 'POST', body: {}, idempotencyKey: 'hold-1' })
    ).resolves.toEqual({ booking: { _id: 'booking-1' } });

    expect(calls).toHaveLength(3);
  });

  it('announces an unrecoverable session and rethrows the original 401', async () => {
    const onExpired = vi.fn();
    onSessionExpired(onExpired);

    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' }),
      failure(401, { code: 'UNAUTHORIZED', message: 'Refresh session expired or invalid' })
    );

    const error = (await request('/bookings').catch(caught => caught)) as ApiError;

    expect(onExpired).toHaveBeenCalledOnce();
    expect(error.status).toBe(401);
    expect(error.message).toBe('Access session expired');
    expect(calls).toHaveLength(2);
  });

  it('honours an explicit opt-out of the refresh cycle', async () => {
    const { calls } = stubFetch(
      failure(401, { code: 'UNAUTHORIZED', message: 'Access session expired' })
    );

    await expect(request('/auth/me', { retryAfterRefresh: false })).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
  });
});
