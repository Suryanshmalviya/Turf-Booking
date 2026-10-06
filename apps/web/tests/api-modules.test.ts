import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminApi } from '../src/services/admin.api';
import { resetApiClientState } from '../src/services/api-client';
import { authApi } from '../src/services/auth.api';
import { bookingApi } from '../src/services/booking.api';
import { courtApi } from '../src/services/court.api';
import { notificationApi } from '../src/services/notification.api';
import { paymentApi } from '../src/services/payment.api';
import { reviewApi } from '../src/services/review.api';
import { userApi } from '../src/services/user.api';

/**
 * Contract tests for every API module.
 *
 * Each case pins the wire call — path, query, method, body, idempotency header —
 * plus how the response is decoded. That is the whole surface the backend
 * exposes, so a rename or a moved field fails here rather than in the browser.
 */

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
  headers: Headers;
}

let calls: RecordedCall[] = [];
let respondWith: unknown = {};

/**
 * Installs a fetch stub. Re-calling it mid-test changes the answer without
 * discarding the calls recorded so far, so a multi-call flow can be asserted in
 * order.
 */
function stubApi(data: unknown = {}, status = 200) {
  respondWith = data;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? init.body : undefined,
        headers: new Headers(init.headers),
      });

      return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, data: respondWith }),
      };
    })
  );
}

/** Same stub, but the envelope carries a pagination block. */
function stubApiWithMeta(data: unknown, pagination: unknown) {
  respondWith = data;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? init.body : undefined,
        headers: new Headers(init.headers),
      });

      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, data: respondWith, meta: pagination }),
      };
    })
  );
}

const path = (index = 0) => calls[index].url.replace('/api/v1', '');
const body = (index = 0) => (calls[index].body ? JSON.parse(calls[index].body) : undefined);

const meta = {
  page: 2,
  limit: 20,
  total: 41,
  totalPages: 3,
  hasNextPage: true,
  hasPreviousPage: true,
};

beforeEach(() => {
  resetApiClientState();
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authApi', () => {
  it('posts credentials to the login endpoint', async () => {
    stubApi({ user: { id: 'user-1' } });

    await authApi.login({ email: 'player@example.com', password: 'Str0ngPassphrase' });

    expect(path()).toBe('/auth/login');
    expect(calls[0].method).toBe('POST');
    expect(body()).toEqual({ email: 'player@example.com', password: 'Str0ngPassphrase' });
  });

  it('posts a registration and returns the created user', async () => {
    stubApi({ user: { id: 'user-1', emailVerified: false } });

    const result = await authApi.register({
      email: 'player@example.com',
      password: 'Str0ngPassphrase',
      displayName: 'Player',
    });

    expect(path()).toBe('/auth/register');
    expect(body()).toEqual({
      email: 'player@example.com',
      password: 'Str0ngPassphrase',
      displayName: 'Player',
    });
    expect(result.user.emailVerified).toBe(false);
  });

  it('signs out with a cookie-authenticated POST', async () => {
    stubApi(undefined, 204);

    await authApi.logout();

    expect(path()).toBe('/auth/logout');
    expect(calls[0].method).toBe('POST');
  });

  it('rotates the session through the refresh endpoint', async () => {
    stubApi({ user: { id: 'user-1' } });

    await authApi.refresh();

    expect(path()).toBe('/auth/refresh');
    expect(calls[0].method).toBe('POST');
  });

  it('resolves a signed-out visitor to null on 401 and throws otherwise', async () => {
    stubApi({ user: { id: 'user-1' } });
    await expect(authApi.me()).resolves.toEqual({ id: 'user-1' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 401,
        ok: false,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({ success: false, error: { message: 'Authentication required' } }),
      }))
    );
    await expect(authApi.me()).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 500,
        ok: false,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: false, error: { message: 'Boom' } }),
      }))
    );
    await expect(authApi.me()).rejects.toMatchObject({ status: 500 });
  });

  it('requests a recovery link without leaking whether the account exists', async () => {
    stubApi({ message: 'If an account exists for that email address…' });

    await authApi.forgotPassword('player@example.com');

    expect(path()).toBe('/auth/forgot-password');
    expect(body()).toEqual({ email: 'player@example.com' });
  });

  it('redeems a recovery token with the new password', async () => {
    stubApi({ message: 'Your password has been reset.', revokedSessions: 3 });

    const result = await authApi.resetPassword({
      token: 'a'.repeat(64),
      password: 'Str0ngPassphrase',
    });

    expect(path()).toBe('/auth/reset-password');
    expect(body()).toEqual({ token: 'a'.repeat(64), password: 'Str0ngPassphrase' });
    expect(result.revokedSessions).toBe(3);
  });

  it('confirms an address and re-issues a verification link', async () => {
    stubApi({ emailVerified: true, message: 'Email address verified.' });
    await authApi.verifyEmail('b'.repeat(64));
    expect(path()).toBe('/auth/verify-email');
    expect(body()).toEqual({ token: 'b'.repeat(64) });

    stubApi({ message: 'A new verification link has been sent' });
    await authApi.resendVerification();
    expect(path(1)).toBe('/auth/resend-verification');
    expect(calls[1].method).toBe('POST');
  });
});

describe('userApi', () => {
  it('reads and updates the caller profile', async () => {
    stubApi({ user: { id: 'user-1', displayName: 'Player' } });

    await userApi.profile();
    expect(path()).toBe('/users/me');

    await userApi.updateProfile({ displayName: 'Renamed' });
    expect(path(1)).toBe('/users/me');
    expect(calls[1].method).toBe('PATCH');
    expect(body(1)).toEqual({ displayName: 'Renamed' });
  });

  it('changes the password through the dedicated endpoint', async () => {
    stubApi({ revokedSessions: 2 });

    const result = await userApi.changePassword({
      currentPassword: 'Str0ngPassphrase',
      newPassword: 'An0therPassphrase',
    });

    expect(path()).toBe('/users/me/password');
    expect(calls[0].method).toBe('POST');
    expect(result.revokedSessions).toBe(2);
  });

  it('lists sessions as rows plus pagination metadata', async () => {
    stubApi([{ id: 'session-1', userAgent: 'vitest' }]);

    const result = await userApi.listSessions();

    expect(path()).toBe('/users/me/sessions');
    expect(result.data).toHaveLength(1);
    expect(result.meta).toBeUndefined();
  });

  it('revokes a single session', async () => {
    stubApi(undefined, 204);

    await userApi.revokeSession('session-1');

    expect(path()).toBe('/users/me/sessions/session-1');
    expect(calls[0].method).toBe('DELETE');
  });

  it('reads venue assignments and the admin directory', async () => {
    stubApi({ assignments: [{ venueId: 'venue-1', role: 'venue_staff' }] });
    await userApi.assignments();
    expect(path()).toBe('/users/me/assignments');

    stubApi([{ _id: 'user-1' }]);
    await userApi.directory();
    expect(path(1)).toBe('/users');
  });
});

describe('courtApi', () => {
  it('lists venues with the search filters as a query string', async () => {
    stubApi({ items: [], total: 0 });

    await courtApi.list({ q: 'court', city: 'Pune', date: '', feature: 'indoor' });

    expect(path()).toBe('/courts?q=court&city=Pune&feature=indoor');
  });

  it('reads venue detail, schedule and availability', async () => {
    stubApi({ venue: { _id: 'venue-1' }, pitches: [] });

    await courtApi.detail('venue-1');
    expect(path()).toBe('/courts/venue-1');

    await courtApi.schedule('venue-1');
    expect(path(1)).toBe('/courts/venue-1/schedule');

    await courtApi.availability('venue-1', 'pitch-1', '2026-09-24', 60);
    expect(path(2)).toBe(
      '/courts/venue-1/pitches/pitch-1/availability?date=2026-09-24&durationMinutes=60'
    );
  });

  it('manages venues and pitches for owners', async () => {
    stubApi({ venue: { _id: 'venue-1' } });

    await courtApi.create({ name: 'New Court', city: 'Pune' });
    expect(path()).toBe('/courts');
    expect(calls[0].method).toBe('POST');

    await courtApi.update('venue-1', { name: 'Renamed' });
    expect(path(1)).toBe('/courts/venue-1');
    expect(calls[1].method).toBe('PATCH');

    await courtApi.createPitch('venue-1', { name: 'Court 1' });
    expect(path(2)).toBe('/courts/venue-1/pitches');
  });
});

describe('bookingApi', () => {
  it('folds rows and pagination metadata into one list result', async () => {
    stubApiWithMeta([{ _id: 'booking-1' }], meta);

    const result = await bookingApi.listMine({ status: 'confirmed', page: 2 });

    expect(path()).toBe('/bookings?status=confirmed&page=2');
    expect(result.items).toEqual([{ _id: 'booking-1' }]);
    expect(result).toMatchObject({ total: 41, page: 2, limit: 20, hasNextPage: true });
  });

  it('falls back to an empty page when the server sends no metadata', async () => {
    stubApi([]);

    const result = await bookingApi.listMine();

    expect(result).toMatchObject({ items: [], total: 0, page: 1, hasNextPage: false });
  });

  it('reads one booking', async () => {
    stubApi({ booking: { _id: 'booking-1' } });

    await bookingApi.detail('booking-1');

    expect(path()).toBe('/bookings/booking-1');
  });

  it('creates a hold with a mandatory idempotency key', async () => {
    stubApi({ booking: { _id: 'booking-1' } });

    await bookingApi.createHold(
      {
        venueId: 'venue-1',
        pitchId: 'pitch-1',
        startAt: '2026-09-24T10:00:00.000Z',
        durationMinutes: 60,
      },
      'hold-1'
    );

    expect(path()).toBe('/holds');
    expect(calls[0].headers.get('Idempotency-Key')).toBe('hold-1');
  });

  it('confirms a hold and cancels a booking', async () => {
    stubApi({ booking: { _id: 'booking-1', status: 'confirmed' } });

    await bookingApi.confirmHold('booking-1');
    expect(path()).toBe('/holds/booking-1/confirm');

    stubApi({ booking: { _id: 'booking-1', status: 'cancelled' } });
    await bookingApi.cancel('booking-1', { reason: 'Cannot make it', idempotencyKey: 'cancel-1' });

    expect(path(1)).toBe('/bookings/booking-1/cancel');
    // The server's cancel validator wants the key in the body as well as the header.
    expect(body(1)).toEqual({ reason: 'Cannot make it', idempotencyKey: 'cancel-1' });
    expect(calls[1].headers.get('Idempotency-Key')).toBe('cancel-1');
  });
});

describe('paymentApi', () => {
  it('starts an attempt with an idempotency key', async () => {
    stubApi({
      attempt: { status: 'paid', amountMinor: 1200, currency: 'INR' },
      developmentOnly: true,
    });

    const result = await paymentApi.createAttempt('booking-1', 'hold-1-payment');

    expect(path()).toBe('/payments/bookings/booking-1/attempts');
    expect(calls[0].headers.get('Idempotency-Key')).toBe('hold-1-payment');
    expect(result.attempt.status).toBe('paid');
  });

  it('never exposes the provider webhook to the browser', async () => {
    stubApi({ processed: 0 });

    await paymentApi.reconcile();

    expect(path()).toBe('/payments/reconcile');
    expect(path()).not.toContain('webhook');
  });
});

describe('reviewApi', () => {
  it('lists public reviews with filters', async () => {
    stubApi([{ _id: 'review-1', rating: 5 }]);

    const result = await reviewApi.list({ venueId: 'venue-1', rating: 5, verifiedOnly: true });

    expect(path()).toBe('/reviews?venueId=venue-1&rating=5&verifiedOnly=true');
    expect(result.reviews).toHaveLength(1);
  });

  it('reads the caller reviews, a single review and the venue summary', async () => {
    stubApi([]);

    await reviewApi.listMine({ page: 1 });
    expect(path()).toBe('/reviews/mine?page=1');

    stubApi({ review: { _id: 'review-1' } });
    await reviewApi.detail('review-1');
    expect(path(1)).toBe('/reviews/review-1');

    stubApi({ rating: { average: 4.5, count: 12 } });
    const summary = await reviewApi.summary('venue-1');
    expect(path(2)).toBe('/reviews/summary?venueId=venue-1');
    expect(summary.rating.average).toBe(4.5);
  });

  it('creates, updates, replies to, moderates and deletes reviews', async () => {
    stubApi({ review: { _id: 'review-1' } });

    await reviewApi.create({ bookingId: 'booking-1', rating: 5, comment: 'Great court' });
    expect(path()).toBe('/reviews');
    expect(calls[0].method).toBe('POST');
    expect(body()).toMatchObject({ bookingId: 'booking-1', rating: 5 });

    await reviewApi.update('review-1', { rating: 4 });
    expect(path(1)).toBe('/reviews/review-1');
    expect(calls[1].method).toBe('PATCH');

    await reviewApi.reply('review-1', 'Thanks for visiting');
    expect(path(2)).toBe('/reviews/review-1/replies');
    expect(body(2)).toEqual({ body: 'Thanks for visiting' });

    await reviewApi.moderate('review-1', 'published', 'Looks fine');
    expect(path(3)).toBe('/reviews/review-1/moderation');
    expect(calls[3].method).toBe('PATCH');
    expect(body(3)).toEqual({ status: 'published', reason: 'Looks fine' });

    stubApi(undefined, 204);
    await reviewApi.remove('review-1');
    expect(path(4)).toBe('/reviews/review-1');
    expect(calls[4].method).toBe('DELETE');
  });
});

describe('notificationApi', () => {
  it('lists the inbox with filters', async () => {
    stubApi([{ _id: 'note-1' }]);

    const result = await notificationApi.list({ unreadOnly: true, page: 1 });

    expect(path()).toBe('/notifications?unreadOnly=true&page=1');
    expect(result.notifications).toHaveLength(1);
  });

  it('reads the unread counter', async () => {
    stubApi({ unread: 3 });

    const result = await notificationApi.unreadCount();

    expect(path()).toBe('/notifications/unread-count');
    expect(result.unread).toBe(3);
  });

  it('marks one, marks all and deletes', async () => {
    stubApi({ notification: { _id: 'note-1' } });

    await notificationApi.markRead('note-1');
    expect(path()).toBe('/notifications/note-1/read');
    expect(calls[0].method).toBe('PATCH');

    stubApi({ updated: 4 });
    const all = await notificationApi.markAllRead();
    expect(path(1)).toBe('/notifications/read-all');
    expect(all.updated).toBe(4);

    stubApi(undefined, 204);
    await notificationApi.remove('note-1');
    expect(path(2)).toBe('/notifications/note-1');
    expect(calls[2].method).toBe('DELETE');
  });
});

describe('adminApi', () => {
  it('reads console data', async () => {
    stubApi({ status: 'connected', counts: {} });

    await adminApi.database();
    expect(path()).toBe('/admin/database');

    await adminApi.venueQueue(1);
    expect(path(1)).toBe('/admin/venues/queue?page=1&limit=25');

    await adminApi.users({ page: 2 });
    expect(path(2)).toBe('/admin/users?page=2&limit=25');

    await adminApi.venues({ page: 1 });
    expect(path(3)).toBe('/admin/venues?page=1&limit=25');

    await adminApi.bookings({ page: 1 });
    expect(path(4)).toContain('/admin/bookings?page=1&limit=25');

    await adminApi.report('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    expect(path(5)).toContain('/admin/reports?from=');
  });

  it('performs moderation writes with a reason', async () => {
    stubApi({ venue: { _id: 'venue-1' } });

    await adminApi.reviewVenue('venue-1', 'active', 'Documents look good');
    expect(path()).toBe('/admin/venues/venue-1/active');
    expect(calls[0].method).toBe('POST');
    expect(body()).toEqual({ reason: 'Documents look good' });

    stubApi({ user: { id: 'user-1' } });
    await adminApi.updateUser('user-1', { role: 'venue_staff' });
    expect(path(1)).toBe('/admin/users/user-1');
    expect(calls[1].method).toBe('PATCH');

    stubApi({ seededCount: 3, venues: [] });
    await adminApi.seed();
    expect(path(2)).toBe('/admin/database/seed');

    stubApi({ venue: { _id: 'venue-2' } });
    await adminApi.createVenue({ name: 'New Court', city: 'Pune' });
    expect(path(3)).toBe('/admin/venues');
  });
});
