# API Architecture

Base URL: **`/api/v1`** (built from `API_VERSION`, overridable with `API_PREFIX`). This document covers the pipeline, contracts and versioning of the HTTP surface implemented in `apps/api/src`.

## Middleware pipeline

Built once in `createApp()` (`src/app.ts`), in order:

| #   | Middleware                         | Responsibility                                                                                            |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `middleware/request-id.ts`         | Correlation ID: adopt inbound `X-Request-ID` or mint a UUID; echo on response and in all logs             |
| 2   | `middleware/security.ts`           | Helmet CSP/HSTS/referrer policy, `X-Powered-By` off, CORS (single origin, credentials), compression       |
| 3   | Body parsers                       | `express.json({ limit, verify })` capturing `rawBody` for webhook signatures, urlencoded, `cookie-parser` |
| 4   | `middleware/logging.ts`            | Pino access log + `logStartup`                                                                            |
| 5   | `middleware/rate-limit.ts`         | Global limiter (`RATE_LIMIT_MAX_REQUESTS`/window)                                                         |
| 6   | `routes/index.ts`                  | Versioned router at `config.apiPrefix`                                                                    |
| 7   | `notFoundHandler` → `errorHandler` | 404 for unmatched routes; `ApiError` → failure envelope                                                   |

## Request handling layers

```
route (guards + Zod)  →  controller (thin, I/O only)  →  service (rules)  →  model
```

Per-endpoint guards are declared in the route file and composed in this order:

1. `authenticate()` / `optionalAuth()` — session extraction (cookie or Bearer), 401 gate.
2. `authorize(...roles)` — role check, 403 on mismatch.
3. `requireCsrf()` — double-submit token on unsafe methods (skipped for GET/HEAD/OPTIONS).
4. `validate(schema)` — Zod parse of `{ params, query, body }`; unknown keys stripped, 400 on failure.
5. Ownership guards — `requireVenueAccess()` / `requireBookingAccess()` where relevant.

Controllers call services and respond only through `sendSuccess` (200), `sendCreated` (201), `sendAccepted` (202) or `sendNoContent` (204) in `utils/api-response.ts`, guaranteeing a single success shape.

## Envelopes

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "requestId": "5f2b…"
}
```

`meta` is present on paginated collections; those responses additionally repeat legacy flat `page`/`limit`/`total` fields for older clients (`withLegacyPagination`).

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email format" }]
  },
  "requestId": "5f2b…"
}
```

Codes originate from `utils/api-error.ts`: `BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `INTERNAL_ERROR`, plus contextual 503 codes (`TRANSACTIONS_REQUIRED`, `NOTIFICATION_PROVIDER_NOT_CONFIGURED`) and rate-limit codes (`RATE_LIMIT_EXCEEDED`, `AUTH_RATE_LIMITED`, `PASSWORD_RECOVERY_RATE_LIMITED`, `WRITE_RATE_LIMITED`, admin-specific limiter codes).

## Status codes

| Code            | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| 200/201/202/204 | OK / created / accepted (async work) / no content                     |
| 400             | Malformed request or validation failure                               |
| 401             | Missing, expired or invalid session                                   |
| 403             | Authenticated but not permitted (role, ownership, CSRF)               |
| 404             | Resource does not exist                                               |
| 409             | State conflict: booking overlap, expired hold, reused idempotency key |
| 422             | Semantically unprocessable input                                      |
| 429             | Rate limited (`RateLimit-*` headers, `retryAfterSeconds` detail)      |
| 500             | Unexpected error (message sanitised; details only in logs)            |
| 503             | Required capability unavailable (transactions, providers)             |

## Cross-cutting concerns

- **Idempotency**: the `Idempotency-Key` header (configurable name, default `idempotency-key`) is required by `POST /payments/bookings/:bookingId/attempts` via `requireIdempotencyKey` and optional on holds; unique indexes make replays return the original record.
- **CSRF**: cookie `pb_csrf` + header `X-CSRF-Token`, compared with `timingSafeEqual`; applied to every cookie-authenticated state change.
- **Rate limiting**: a shared credential limiter (register/login/verify), a recovery limiter, a write limiter and ad-hoc admin limiters; draft-7 standard headers; skipped in `test`.
- **Pagination**: `page`/`limit` (default 20, capped by `PAGINATION_MAX_LIMIT`), whitelisted `sort` fields with a per-resource fallback.
- **Ownership**: `assertVenueAccess` / `assertBookingAccess` live in the services — admins always pass; customers only their own resources; owners/staff stay scoped to their venue.

## Route surface (canonical)

| Prefix                  | Router                 | Notes                                                                             |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `/api/v1/health`        | `health.routes`        | `GET /`, `GET /detailed` — public                                                 |
| `/api/v1/auth`          | `auth.routes`          | register, login, refresh, logout, me, forgot/reset password, verify/resend e-mail |
| `/api/v1/users`         | `users.routes`         | `/me` profile, password, assignments, sessions; admin directory                   |
| `/api/v1/courts`        | `courts.routes`        | venues, courts, hours, pricing, availability, calendar, blackouts, moderation     |
| `/api/v1/venues`        | _(alias)_              | mounts `courts.routes` for compatibility                                          |
| `/api/v1/bookings`      | `bookings.routes`      | list / detail / cancel / refund                                                   |
| `/api/v1/holds`         | `holds.routes`         | create hold, confirm hold (customer only)                                         |
| `/api/v1/payments`      | `payments.routes`      | attempts, provider webhook, reconciliation                                        |
| `/api/v1/reviews`       | `reviews.routes`       | public reads, customer CRUD, operator replies, admin moderation                   |
| `/api/v1/notifications` | `notifications.routes` | caller-scoped inbox                                                               |
| `/api/v1/admin`         | `admin.routes`         | admin-only; `/venues/...` and `/courts/...` both accepted                         |

Full endpoint-by-endpoint documentation: [../api/api-documentation.md](../api/api-documentation.md).

## Versioning policy

- The prefix is fixed at process start from `API_VERSION` (`^v\d+$`).
- Additive changes stay in v1; breaking changes get a new version mounted alongside (`router.use('/v2', v2Routes)` inside the versioned router) so old clients keep working during migration.
- Aliases (`/venues` → `/courts`) are the compatibility mechanism for renames within a version.
