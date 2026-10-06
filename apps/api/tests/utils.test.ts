import { describe, expect, it } from 'vitest';

import { validate } from '../src/middleware/validate';
import { ApiError } from '../src/utils/api-error';
import { sendCreated, sendSuccess } from '../src/utils/api-response';
import { paginationMeta, withLegacyPagination } from '../src/utils/pagination';
import { containsRegex, escapeRegex, exactRegex } from '../src/utils/query';
import { requireIdempotencyKey } from '../src/utils/request';
import { parseSort } from '../src/utils/sort';
import { listUsersSchema } from '../src/validators/users.validator';
import { changePasswordSchema, updateProfileSchema } from '../src/validators/users.validator';

describe('pagination helpers', () => {
  it('derives totals, page counts and navigation flags', () => {
    expect(paginationMeta({ page: 2, limit: 10, total: 25 })).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });

    expect(paginationMeta({ page: 1, limit: 10, total: 0 })).toMatchObject({
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('exposes legacy flat pagination fields alongside meta', () => {
    const page = withLegacyPagination({
      items: [1, 2],
      meta: paginationMeta({ page: 1, limit: 2, total: 5 }),
    });

    expect(page).toMatchObject({ page: 1, limit: 2, total: 5 });
    expect(page.meta.totalPages).toBe(3);
    expect(page.items).toHaveLength(2);
  });
});

describe('sort whitelist', () => {
  const whitelist = { createdAt: 1, email: 1 } as const;
  const fallback = { createdAt: -1 } as const;

  it('parses descending and multi-field sort expressions', () => {
    expect(parseSort('-createdAt,email', whitelist, fallback)).toEqual({ createdAt: -1, email: 1 });
    expect(parseSort(' email ', whitelist, fallback)).toEqual({ email: 1 });
  });

  it('falls back when the sort is absent or blank', () => {
    expect(parseSort(undefined, whitelist, fallback)).toEqual(fallback);
    expect(parseSort(' , ', whitelist, fallback)).toEqual(fallback);
  });

  it('rejects fields that are not whitelisted', () => {
    expect(() => parseSort('passwordHash', whitelist, fallback)).toThrow(ApiError);
    expect(() => parseSort('passwordHash', whitelist, fallback)).toThrow(/not supported/);
  });
});

describe('query helpers', () => {
  it('escapes regular expression metacharacters in user input', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(containsRegex('a.b').test('a.b')).toBe(true);
    expect(containsRegex('a.b').test('axb')).toBe(false);
    expect(exactRegex('Mumbai').test('mumbai')).toBe(true);
    expect(exactRegex('Mumbai').test('Mumbai West')).toBe(false);
  });
});

describe('idempotency key extraction', () => {
  it('prefers the header and falls back to the body field', () => {
    expect(
      requireIdempotencyKey({
        header: () => 'header-key',
        body: { idempotencyKey: 'body-key' },
      } as never)
    ).toBe('header-key');

    expect(
      requireIdempotencyKey({
        header: () => undefined,
        body: { idempotencyKey: 'body-key' },
      } as never)
    ).toBe('body-key');
  });

  it('rejects a missing or blank key', () => {
    expect(() => requireIdempotencyKey({ header: () => undefined, body: {} } as never)).toThrow(
      'Idempotency-Key header is required'
    );
    expect(() => requireIdempotencyKey({ header: () => '  ', body: {} } as never)).toThrow(
      ApiError
    );
  });
});

describe('response envelope builder', () => {
  const responseDouble = () => {
    const sent: { status?: number; body?: unknown } = {};
    return {
      sent,
      status(code: number) {
        sent.status = code;
        return {
          json(body: unknown) {
            sent.body = body;
          },
        };
      },
      getHeader: () => 'request-1',
    };
  };

  it('always includes success, data and the request id', () => {
    const response = responseDouble();
    sendSuccess(response as never, { id: '1' });

    expect(response.sent.status).toBe(200);
    expect(response.sent.body).toEqual({
      success: true,
      data: { id: '1' },
      requestId: 'request-1',
    });
  });

  it('attaches pagination meta and honours the created status', () => {
    const response = responseDouble();
    sendCreated(response as never, [1], {
      meta: paginationMeta({ page: 1, limit: 1, total: 1 }),
    });

    expect(response.sent.status).toBe(201);
    expect(response.sent.body).toMatchObject({
      success: true,
      data: [1],
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
  });
});

describe('validation middleware', () => {
  const runValidate = (schema: Parameters<typeof validate>[0], request: unknown) =>
    new Promise<{ error?: unknown; request?: Record<string, unknown> }>(resolve => {
      const handler = validate(schema);
      const req = request as {
        body: unknown;
        query: Record<string, unknown>;
        params: Record<string, unknown>;
      };
      handler(
        req as never,
        {} as never,
        ((error?: unknown) => resolve({ error, request: req })) as never
      );
    });

  it('replaces raw input with coerced values', async () => {
    const { request } = await runValidate(listUsersSchema, {
      body: {},
      query: { page: '2', limit: '5' },
      params: {},
    });

    expect(request?.query).toMatchObject({ page: 2, limit: 5 });
  });

  it('normalises failures into a validation ApiError with field details', async () => {
    const { error } = await runValidate(updateProfileSchema, { body: {}, query: {}, params: {} });

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(400);
    expect((error as ApiError).code).toBe('VALIDATION_ERROR');
  });

  it('reports every failing field in the validation error', async () => {
    const { error } = await runValidate(changePasswordSchema, {
      body: { currentPassword: 'old-passphrase', newPassword: 'weak' },
      query: {},
      params: {},
    });

    const details = (error as ApiError).details as Array<{ field: string; message: string }>;
    expect(details.every(detail => detail.field === 'body.newPassword')).toBe(true);
    expect(details.map(detail => detail.message).join(' ')).toContain('8 characters');
  });
});
