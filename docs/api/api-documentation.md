# API Documentation

Version **v1** — base path `/api/v1`. Every response uses the envelopes described in [../architecture/api-architecture.md](../architecture/api-architecture.md).

## Conventions

- **Auth**: session cookie (`pb_access`, `HttpOnly`) set at login, or `Authorization: Bearer <access-token>` for non-browser clients.
- **CSRF**: unsafe methods (POST/PATCH/PUT/DELETE) authenticated by cookie must echo the `pb_csrf` cookie value in the `X-CSRF-Token` header. Requests authenticated by Bearer token are unaffected by CSRF checks at the client, but the middleware still applies where wired.
- **Idempotency**: `Idempotency-Key` header (opaque string ≤ 200 chars).
- **Pagination query**: `page` (default 1), `limit` (default 20, max 100 by default), `sort` (field list is whitelisted per resource, `-field` for descending).
- **Validation**: unknown/invalid input → `400 VALIDATION_ERROR` with `details[]`.
- **Rate limits**: credential endpoints 10/window, password recovery 5/window, global default 300/window (all per `RATE_LIMIT_WINDOW_MS`, default 15 min).

## Health

| Method | Path               | Auth   | Description                                      |
| ------ | ------------------ | ------ | ------------------------------------------------ |
| GET    | `/health`          | public | Liveness report (fast, no dependency probes)     |
| GET    | `/health/detailed` | public | Detailed report including dependency diagnostics |

## Authentication — `/auth`

| Method | Path                        | Auth           | CSRF | Rate limit | Description                                                                                                                                  |
| ------ | --------------------------- | -------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`            | public         | —    | credential | Create a `customer` account; with `AUTH_REQUIRE_EMAIL_VERIFICATION=true` the account starts unverified and sign-in is refused until verified |
| POST   | `/auth/login`               | public         | —    | credential | Verify credentials; sets `pb_access`, `pb_refresh`, `pb_csrf` cookies (tokens are never in the body)                                         |
| POST   | `/auth/refresh`             | refresh cookie | yes  | global     | Rotate the access session using the `pb_refresh` cookie                                                                                      |
| POST   | `/auth/logout`              | refresh cookie | yes  | global     | Revoke the session and clear all auth cookies                                                                                                |
| GET    | `/auth/me`                  | session        | —    | global     | Current principal (`sub`, `role`, profile summary)                                                                                           |
| POST   | `/auth/forgot-password`     | public         | —    | recovery   | Issue a single-use reset token (e-mailed); response never reveals account existence                                                          |
| POST   | `/auth/reset-password`      | public         | —    | recovery   | Consume the reset token and set a new password                                                                                               |
| POST   | `/auth/verify-email`        | public         | —    | credential | Consume the verification token                                                                                                               |
| POST   | `/auth/resend-verification` | session        | yes  | credential | Re-issue verification for the signed-in user                                                                                                 |

Example:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "player@example.com", "password": "…" }
```

```json
{ "success": true, "data": { "user": { "id": "…", "role": "customer" } }, "requestId": "…" }
```

## Users — `/users`

| Method | Path                            | Auth           | Description                             |
| ------ | ------------------------------- | -------------- | --------------------------------------- |
| GET    | `/users/me`                     | session        | Own profile                             |
| PATCH  | `/users/me`                     | session + CSRF | Update profile (`displayName`, `phone`) |
| POST   | `/users/me/password`            | session + CSRF | Change password (current + new)         |
| GET    | `/users/me/assignments`         | session        | Venue staff assignments of the caller   |
| GET    | `/users/me/sessions`            | session        | List active sessions (paginated)        |
| DELETE | `/users/me/sessions/:sessionId` | session + CSRF | Revoke one of the caller's sessions     |
| GET    | `/users`                        | admin          | Directory (paginated, filterable)       |
| GET    | `/users/:userId`                | admin          | Any user record                         |

## Venues & courts — `/courts` (alias `/venues`)

### Public reads (anonymous or optional session)

| Method | Path                                                                                | Description                                                                          |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/courts`                                                                           | List venues (filters: search/city/status, pagination, `optionalAuth` scopes results) |
| GET    | `/courts/:venueId`                                                                  | Venue detail incl. courts                                                            |
| GET    | `/courts/:venueId/schedule`                                                         | Operating schedule for the venue                                                     |
| GET    | `/courts/:venueId/pitches/:pitchId/availability?date=YYYY-MM-DD&durationMinutes=60` | Free intervals with venue-local times and `priceMinor`                               |
| GET    | `/courts/:venueId/reviews`                                                          | Published reviews (paginated, filter by rating)                                      |
| GET    | `/courts/:venueId/rating`                                                           | Rating summary (count/average + breakdown)                                           |

Availability response item:

```json
{
  "startAt": "2026-05-10T18:00:00.000Z",
  "endAt": "2026-05-10T19:00:00.000Z",
  "startLocal": "23:30",
  "endLocal": "00:30",
  "timezone": "Asia/Kolkata",
  "priceMinor": 120000,
  "currency": "INR"
}
```

### Venue management (owner/admin, CSRF)

| Method | Path                                       | Description                                             |
| ------ | ------------------------------------------ | ------------------------------------------------------- |
| POST   | `/courts`                                  | Create a venue (status starts `draft`/`pending_review`) |
| PATCH  | `/courts/:venueId`                         | Update venue (`requireVenueAccess`)                     |
| POST   | `/courts/:venueId/pitches`                 | Add a court                                             |
| PATCH  | `/courts/:venueId/pitches/:pitchId`        | Update a court                                          |
| DELETE | `/courts/:venueId/pitches/:pitchId`        | Remove a court                                          |
| POST   | `/courts/:venueId/availability-rules`      | Add weekly operating window                             |
| POST   | `/courts/:venueId/availability-exceptions` | Add per-date blackout/special-open                      |
| POST   | `/courts/:venueId/price-rules`             | Add a pricing rule                                      |
| POST   | `/courts/:venueId/blackouts`               | Blackout with a reason (audited)                        |

### Operator & moderation

| Method | Path                                            | Roles                           | Description                                         |
| ------ | ----------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| GET    | `/courts/:venueId/calendar?from=<ISO>&to=<ISO>` | venue_owner, venue_staff, admin | Bookings in range (`requireVenueAccess`)            |
| POST   | `/courts/:venueId/review/:action`               | admin                           | Moderate a venue (`approve`/`reject`/… with reason) |

## Holds — `/holds` (customer only, CSRF)

| Method | Path                        | Description                                   |
| ------ | --------------------------- | --------------------------------------------- |
| POST   | `/holds`                    | Create a short-lived hold                     |
| POST   | `/holds/:bookingId/confirm` | Promote a paid, unexpired hold to `confirmed` |

```http
POST /api/v1/holds
X-CSRF-Token: <pb_csrf value>
Idempotency-Key: 6f9d…

{ "venueId": "…", "pitchId": "…", "startAt": "2026-05-10T18:00:00.000Z",
  "durationMinutes": 60, "idempotencyKey": "6f9d…" }
```

Responses: `201` with the `held` booking (`holdExpiresAt`, `amountMinor`, `currency`, `publicReference`, policy snapshot); `409 CONFLICT` if the interval is gone or the idempotency key was already consumed; `503 TRANSACTIONS_REQUIRED` without replica-set support.

Confirmation requires a `paid` `PaymentAttempt` whose `amountMinor`/`currency` match the booking; otherwise `409`.

## Bookings — `/bookings` (session required)

| Method | Path                           | Roles                                     | CSRF | Description                                                                               |
| ------ | ------------------------------ | ----------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| GET    | `/bookings`                    | customer, admin                           | —    | Own bookings (admin may pass `userId`); filters `status`, `from`, `to`, `venueId`, `sort` |
| GET    | `/bookings/:bookingId`         | owner-scoped                              | —    | Booking detail                                                                            |
| POST   | `/bookings/:bookingId/cancel`  | customer, venue_owner, venue_staff, admin | yes  | Cancel with `{ reason, idempotencyKey }`; refund % from the policy snapshot; audited      |
| POST   | `/bookings/:bookingId/refunds` | venue_owner, admin                        | yes  | Request a refund `{ paymentAttemptId, amountMinor, currency, reason, idempotencyKey }`    |

Cancellation rules: `cancelled`/`completed`/`no_show` → `409`; customers can only cancel their own bookings; operators act on their venue's bookings. If `refundPercent > 0` a refund is requested automatically against the latest paid attempt.

## Payments — `/payments`

| Method | Path                                     | Auth                                | Description                                                                                  |
| ------ | ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/payments/webhook`                      | **signature**                       | Provider callback; raw-body HMAC/SDK verification; deduplicated by `(provider, eventId)`     |
| POST   | `/payments/bookings/:bookingId/attempts` | customer + CSRF + `Idempotency-Key` | Start a payment for a held booking → `201 { attempt, developmentOnly }`                      |
| POST   | `/payments/reconcile`                    | admin + CSRF                        | Mark stale `pending` attempts `uncertain` (and mirror onto bookings) → `{ markedUncertain }` |

With `PAYMENT_PROVIDER=unselected` attempts fail closed. With `development_mock`, the webhook payload must be signed with `PAYMENT_WEBHOOK_SECRET` (HMAC-SHA256 over the raw body) and sent in `payment-signature`.

## Reviews — `/reviews`

| Method | Path                            | Auth                                   | Description                                                                            |
| ------ | ------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/reviews`                      | public                                 | Published reviews (filter by venue, rating; paginated)                                 |
| GET    | `/reviews/summary`              | public                                 | Aggregate rating summary                                                               |
| GET    | `/reviews/mine`                 | session                                | Caller's own reviews                                                                   |
| GET    | `/reviews/:reviewId`            | public                                 | Review detail                                                                          |
| POST   | `/reviews`                      | customer + CSRF                        | Create (one per booking; `isVerifiedBooking` when the booking exists and is completed) |
| PATCH  | `/reviews/:reviewId`            | owner + CSRF                           | Edit own review while permitted                                                        |
| DELETE | `/reviews/:reviewId`            | owner + CSRF                           | Delete own review                                                                      |
| POST   | `/reviews/:reviewId/replies`    | venue_owner, venue_staff, admin + CSRF | Venue reply                                                                            |
| PATCH  | `/reviews/:reviewId/moderation` | admin + CSRF                           | `flag`/`hide`/restore with reason (audited)                                            |

## Notifications — `/notifications` (session; caller-scoped)

| Method | Path                                  | Description                                             |
| ------ | ------------------------------------- | ------------------------------------------------------- |
| GET    | `/notifications`                      | Inbox (filters: `status`, `type`, `unreadOnly`, `sort`) |
| GET    | `/notifications/unread-count`         | `{ unread }`                                            |
| POST   | `/notifications/read-all`             | Mark all read → `{ updated }`                           |
| PATCH  | `/notifications/:notificationId/read` | Mark one read                                           |
| DELETE | `/notifications/:notificationId`      | Delete one                                              |

## Admin — `/admin` (admin role + CSRF on writes)

| Method | Path                                                   | Description                                                                             |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| GET    | `/admin/database`                                      | Database diagnostics                                                                    |
| POST   | `/admin/database/seed`                                 | Trigger seed (rate limit **2**/window)                                                  |
| GET    | `/admin/venues/queue` · `/admin/courts/queue`          | Venue approval queue (paginated)                                                        |
| GET    | `/admin/users`                                         | User directory                                                                          |
| PATCH  | `/admin/users/:userId`                                 | Update user status/role with reason                                                     |
| GET    | `/admin/venues` · `/admin/courts`                      | Venue list                                                                              |
| POST   | `/admin/venues` · `/admin/courts`                      | Create a venue                                                                          |
| GET    | `/admin/bookings`                                      | Booking search (status/venue/date filters)                                              |
| GET    | `/admin/bookings/:bookingId/payments`                  | Payment + refund records for one booking                                                |
| GET    | `/admin/reports?from=&to=`                             | Booking counts, cancellations, gross value, refunds, utilization                        |
| GET    | `/admin/exports/bookings?from=&to=`                    | Safe export rows (PII/password/token fields omitted)                                    |
| POST   | `/admin/venues/:venueId/:action` · `/admin/courts/...` | Venue action with reason (audited)                                                      |
| POST   | `/admin/notifications/process`                         | Drain the notification outbox (rate limit **5**/window) → `{ sent, failed, remaining }` |

Report definitions: booking counts grouped by status where `startAt ∈ [from, to)`; cancellations with `startAt` in range; `amountMinor` sums for confirmed/completed bookings per currency; succeeded refunds per currency; booked minutes per venue (a percentage additionally needs configured operating minutes and is not inferred).

## Errors

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "The requested interval is no longer available"
  },
  "requestId": "…"
}
```

Frequently seen codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403 incl. `CSRF validation failed`), `NOT_FOUND` (404), `CONFLICT` (409 — overlaps, expired holds, reused keys), `AUTH_RATE_LIMITED`/`RATE_LIMIT_EXCEEDED`/`PASSWORD_RECOVERY_RATE_LIMITED` (429), `TRANSACTIONS_REQUIRED` (503).
