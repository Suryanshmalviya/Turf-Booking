# Pickleball Booking

## Overview

Pickleball Booking is a production-grade court reservation platform built as an npm-workspace monorepo. Customers discover venues, check per-slot availability, place a short-lived hold on a court, pay, and manage their bookings; venue operators manage courts, hours, pricing and calendars; platform administrators moderate venues and users, inspect payments, and run reports.

The repository contains three workspaces:

| Workspace         | Package              | Role                                             |
| ----------------- | -------------------- | ------------------------------------------------ |
| `apps/api`        | `@pickleball/api`    | Express + Mongoose JSON API (`/api/v1`)          |
| `apps/web`        | `@pickleball/web`    | React single-page application (Vite + Tailwind)  |
| `packages/shared` | `@pickleball/shared` | Types, constants and utilities used by both apps |

Two design constraints shape the whole codebase:

- **The browser only ever talks to the API.** All persistence, pricing, availability and authorization decisions happen server-side; the SPA never touches MongoDB and never computes an authoritative price.
- **Fails closed.** No live payment provider is configured by default (`PAYMENT_PROVIDER=unselected`), money is stored in minor units as integers, and a booking cannot become `confirmed` without a verified payment attempt matching its stored amount and currency.

## Features

- Venue search and public venue/court detail pages with schedules, pricing and reviews
- Availability grid per court computed in the venue's own timezone (operating hours, per-date exceptions, blackouts, buffers, slot increments)
- Two-phase booking: short-lived **hold** → payment → **confirmation**
- Double-booking protection via MongoDB transactions plus a unique slot inventory index (see [Double Booking Prevention](#double-booking-prevention))
- Idempotency keys on holds, payment attempts and refunds
- Cancellation with an immutable policy snapshot and automatic refund request
- Reviews (one per booking, verified after a completed stay) with venue replies and admin moderation
- In-app notification inbox backed by a transactional outbox with retry/backoff
- Admin console: venue approval queue, user/venue/booking lookup, payment/refund/audit visibility, safe booking exports and reports
- JWT sessions in `HttpOnly` cookies with double-submit CSRF, silent refresh, email verification and password recovery
- Structured logging with request IDs, centralised error envelope, rate limiting, Helmet/CORS hardening

## User Features

- Register, sign in, verify e-mail, reset password, view/revoke active sessions (`/api/v1/users/me/sessions`)
- Browse venues (`/venues`), view venue detail with courts, schedule, rating and reviews
- Check real-time availability for a court (`GET /api/v1/courts/:venueId/pitches/:pitchId/availability`)
- Place a hold (`POST /api/v1/holds`), pay (`POST /api/v1/payments/bookings/:bookingId/attempts`), confirm (`POST /api/v1/holds/:bookingId/confirm`)
- View "My bookings", booking detail and confirmation pages; cancel with a reason (`POST /api/v1/bookings/:bookingId/cancel`)
- Read their own notification inbox (`/api/v1/notifications`) and mark items read
- Submit a review for a completed booking and edit/delete it while unpublished
- Theme preference (light/dark) stored client-side in Zustand

## Admin Features

All admin APIs live under `/api/v1/admin`, require an authenticated session with the `admin` role, and are surfaced in the SPA under `/admin` (dashboard, users, courts, bookings, payments, reviews, reports, settings).

- Venue approval queue and state-changing actions (`POST /api/v1/admin/venues/:venueId/:action`), each requiring a reason and recorded in the audit log
- Paginated user, venue and booking lookup; user status updates with a reason
- Read-only payment, refund and audit visibility (`GET /api/v1/admin/bookings/:bookingId/payments`)
- Reports (`GET /api/v1/admin/reports`): booking counts by status, cancellations, gross booking value and refunds grouped by currency, and booked-minutes utilization per venue
- Booking export (`GET /api/v1/admin/exports/bookings`) that omits e-mail, phone, password hashes, tokens and provider credentials
- Notification outbox draining (`POST /api/v1/admin/notifications/process`, rate-limited to 5 requests per window)
- Database diagnostics (`GET /api/v1/admin/database`) and a heavily rate-limited seed endpoint (2 requests per window)

There is no admin impersonation endpoint anywhere in the API.

## Technology Stack

| Layer    | Technology                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript 5.4 (strict), Vite 6, Tailwind CSS 3, React Router 6, TanStack Query 5, Zustand 5, React Hook Form 7 + Zod resolver, Recharts 3 |
| Backend  | Node.js ≥ 20, Express 4, TypeScript 5.4 (ESM), Mongoose 8, Zod 3, jsonwebtoken 9, bcryptjs 2, Pino 8, express-rate-limit 7, Helmet 7                 |
| Database | MongoDB 7 (replica set required for booking transactions), TTL + unique indexes                                                                      |
| Testing  | Vitest 3, Supertest 6, mongodb-memory-server 11 (API); Testing Library React 14 + jsdom (web)                                                        |
| Quality  | ESLint 9 (flat config) + typescript-eslint, Prettier 3, Husky 9, TypeScript `tsc --noEmit`                                                           |
| Delivery | GitHub Actions (CI/CD/Security), Docker multi-stage builds, nginx, Docker Compose, Render blueprint                                                  |
| Tooling  | npm workspaces, concurrently, tsx (scripts), esbuild (API bundling)                                                                                  |

## Architecture

The system is a three-tier monorepo:

```
Browser (React SPA)
   │  fetch, same-origin /api/v1 (Vite dev proxy or nginx proxy in Docker)
   ▼
Express API (/api/v1)                                ← stateless, horizontally scalable
   │  middleware pipeline: requestId → security/CORS → body parsing (+raw body)
   │  → access log → rate limit → routes → 404 → error handler
   ▼
MongoDB (replica set)  ← transactions for holds/confirmations, TTL indexes for expiry
```

- **API entrypoint**: `apps/api/src/server.ts` calls `startServer()` from `apps/api/src/app.ts`, which connects the database, runs the idempotent admin bootstrap (`ensureAdminUser`), registers graceful-shutdown handlers, then listens on `PORT`. `createApp()` is exported separately so tests mount the app without opening a socket.
- **Same-origin by default**: the web client calls `import.meta.env.VITE_API_URL ?? '/api/v1'`. In Docker, nginx proxies `/api/` to the API container, so cookies stay first-party and CORS is not involved. Split-origin deployments set `VITE_API_URL` and `FRONTEND_URL` and require `AUTH_COOKIE_SECURE=true` + `AUTH_COOKIE_SAME_SITE=none` (validated by config).
- **Compatibility aliases**: `/api/v1/venues` mounts the courts router, and the admin router accepts both `/venues/...` and `/courts/...` paths.

Deep dive: [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md).

## Folder Structure

```
book-Court/
├── apps/
│   ├── api/                        # @pickleball/api — Express API
│   │   ├── src/
│   │   │   ├── config/             # env schema (Zod), logger, database, admin bootstrap
│   │   │   ├── controllers/        # request handlers (thin; call services)
│   │   │   ├── middleware/         # request-id, security, auth, role, authorization,
│   │   │   │                       # rate-limit, validate, logging, error-handler
│   │   │   ├── models/             # Mongoose schemas + indexes
│   │   │   ├── routes/             # route tables with validation/authorization wiring
│   │   │   ├── services/           # business logic (bookings, availability, payments,
│   │   │   │                       # notifications, auth, courts, admin, reviews, users)
│   │   │   ├── types/              # enums, auth/pagination/api types, Express augmentation
│   │   │   ├── utils/              # ApiError, responses, pagination, sort/query helpers,
│   │   │   │                       # timezone, async-handler
│   │   │   ├── validators/         # Zod schemas (one file per route group)
│   │   │   ├── app.ts              # middleware pipeline + startServer()
│   │   │   └── server.ts           # process entrypoint
│   │   ├── tests/                  # Vitest integration/unit tests (+ helpers/, setup.ts)
│   │   └── package.json
│   └── web/                        # @pickleball/web — React SPA
│       ├── public/                 # static files served from site root
│       ├── src/
│       │   ├── assets/             # bundled assets
│       │   ├── components/         # admin/, booking/, common/, court/, forms/, layout/, ui/
│       │   ├── context/            # AuthProvider, QueryProvider, ToastProvider, ThemeProvider
│       │   ├── hooks/              # useAuth, useBookings, useCourts, useAdmin, ...
│       │   ├── pages/              # admin/, auth/, public/, user/
│       │   ├── routes/             # AppRoutes, ProtectedRoute, AdminRoute, paths
│       │   ├── services/           # api-client + one *.api.ts per resource + queryKeys
│       │   ├── store/              # Zustand stores (bookingDraft, theme, toast, venueFilter)
│       │   ├── styles/             # Tailwind entry CSS
│       │   ├── types/              # api, auth, booking, court, admin, ui types
│       │   ├── utils/              # csrf, error, date/format, validation, cn
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── tests/                  # Vitest component/integration tests (+ helpers/)
│       └── package.json
├── packages/
│   └── shared/                     # @pickleball/shared — types, constants, utils
│       ├── src/{types,constants,utils}/
│       └── package.json
├── database/                       # index reference + migration/seeding policy
├── docker/                         # api.Dockerfile, web.Dockerfile, nginx.conf
├── docs/                           # architecture, api and deployment documentation
├── scripts/                        # seed.ts, seed-court.ts (npm run db:seed[:court])
├── .github/workflows/              # ci.yml, cd.yml, security.yml
├── docker-compose.yml              # mongodb + api + web (+ mongo-express via profile)
├── render.yaml                     # Render blueprint (API web service + static site)
├── package.json                    # workspace scripts
├── tsconfig.base.json              # shared strict TS config
├── eslint.config.js                # ESLint 9 flat config
├── prettier.config.js
└── .env.example                    # environment template
```

## Frontend Architecture

- **Routing** (`src/routes/`): `AppRoutes` builds one route table with layout guards. Public routes (home, login, register, venue search/detail) render inside `RootLayout`; the booking journey (book, checkout, bookings, detail, confirmation) is wrapped in `ProtectedRoute`; the whole `/admin` console is wrapped in `AdminRoute`. Admin sections are `React.lazy`-loaded so Recharts and the console code never enter the customer bundle. `paths.ts` is the single source of truth for hrefs and patterns; `/admin/dashboard` redirects to `/admin`.
- **Networking** (`src/services/api-client.ts`): the only place the app calls `fetch`. It resolves the base URL, attaches credentials, adds the `X-CSRF-Token` double-submit header on unsafe methods, enforces a 20 s timeout, unwraps the `{ success, data, meta, requestId }` envelope, normalises errors into `ApiError`, and performs a **single-flight silent refresh**: concurrent 401s share one `/auth/refresh` call, and only GETs or writes carrying an `Idempotency-Key` are ever replayed after refresh. Feature code uses `apiClient.get/post/patch/put/delete` through per-resource modules (`booking.api.ts`, `payment.api.ts`, `admin.api.ts`, ...) plus a central `queryKeys.ts`.
- **Server state**: TanStack Query owns caching and mutations (`QueryProvider`); hooks such as `useBookings`, `useCourts`, `usePayments`, `useAdmin` wrap the per-feature query/mutation calls.
- **Client state**: Zustand stores for non-server state — `bookingDraft` (selection carried from the availability grid to checkout), `toast`, `theme`, `venueFilter`.
- **Auth/session**: `AuthProvider` exposes session state from `GET /auth/me`; route guards consume it; `utils/csrf.ts` reads the readable CSRF cookie for the double-submit header.
- **Forms**: React Hook Form + `@hookform/resolvers/zod` (`LoginForm`, `RegisterForm`, `VenueCreateForm`, `VenueSearchForm`, `FormField`).
- **UI**: primitives in `components/ui` (Button, Modal, Dialog, Table, Toast, ...) styled with Tailwind; `AsyncBoundary`, `ErrorState` and `EmptyState` standardise loading/error rendering.

## Backend Architecture

Layered with one-way dependencies: **routes → controllers → services → models/utils**.

- **Routes** declare the contract: authentication (`authenticate`/`optionalAuth`), role checks (`authorize(...)`), CSRF (`requireCsrf`), request validation (`validate(zodSchema)`) and venue/booking ownership (`requireVenueAccess`, `requireBookingAccess`).
- **Controllers** stay thin: pull typed input from `request`, call a service, emit the response through `sendSuccess`/`sendCreated`/`sendAccepted`/`sendNoContent` — the only success exit points, guaranteeing one envelope across the API.
- **Services** own the business rules: `bookings.service` (holds, confirmation, cancellation, refund orchestration), `availability.service` (window/slot/price computation), `payments.service` (attempts, webhooks, refunds, reconciliation), `notifications.service` (outbox), `auth.service`/`auth-token.service`/`auth-mail.service`, `courts.service`, `reviews.service`, `users.service`, `admin.service`.
- **Validation**: every body/query/params object passes through a Zod schema in `src/validators` (unknown keys stripped), then services build typed `FilterQuery<T>` internally; sort fields are whitelisted (`utils/sort.ts`) and user-supplied regexes are escaped (`utils/query.ts`).
- **Errors**: services throw `ApiError` (`BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `INTERNAL_ERROR`, plus 503 codes such as `TRANSACTIONS_REQUIRED`); `middleware/error-handler` maps them to the failure envelope with the request ID.
- **Config**: `config/index.ts` parses `process.env` with a Zod schema — fails fast on JWT secrets shorter than 32 chars, requires `AUTH_COOKIE_SECURE` in production or when `SameSite=none`, and validates pagination limits. `.env` is loaded from the cwd first, then the repository root.
- **Observability**: `middleware/request-id` honours an inbound `X-Request-ID`, `middleware/logging` writes Pino access logs, and `logStartup` records the boot summary. `SIGINT`/`SIGTERM` trigger a graceful disconnect.

## Database Architecture

Full detail: [docs/architecture/database-design.md](docs/architecture/database-design.md) and `database/README.md`.

- **17 collections**, all with timestamps and `versionKey: false`: `users`, `venues`, `pitches`, `availablerules`, `availabilityexceptions`, `pricerules`, `bookings`, `bookinginventories`, `paymentattempts`, `paymentwebhookevents`, `refunds`, `reviews`, `notifications`, `authsessions`, `authtokens`, `auditlogs`, `venuestaffassignments`.
- **Integrity is enforced by indexes**, not application checks alone:
  - `BookingInventory (pitchId, slotStartAt)` **unique** — the hard double-booking guard; `expiresAt` TTL reclaims abandoned holds
  - `Booking (userId, idempotencyKey)` unique sparse; `publicReference` unique
  - `PaymentAttempt (bookingId, idempotencyKey)` unique; `(provider, providerPaymentId)` unique sparse
  - `Refund (bookingId, idempotencyKey)` unique; `Review (bookingId, userId)` unique (one review per booking)
  - `Notification deduplicationKey` unique; `PaymentWebhookEvent (provider, eventId)` unique (webhook dedupe)
  - `VenueStaffAssignment (venueId, userId)` unique; `User.email` unique
- **Money** is always an integer `amountMinor` plus ISO-4217 `currency` (`^[A-Z]{3}$`); floating point is never used.
- **Time**: bookings store UTC `startAt`/`endAt` plus the venue `timezone` (IANA); venue-local days are derived with `utils/timezone.ts`.
- **Migrations**: schema changes ship as versioned application changes (model + index + documented backfill in `database/README.md`); Mongoose creates indexes at startup (`autoIndex` is disabled in production). Booking writes require a **replica set** for transactions.

## Authentication

- **Tokens**: short-lived access JWT (`JWT_EXPIRES_IN`, default `15m`) and refresh JWT (`JWT_REFRESH_EXPIRES_IN`, default `7d`) signed with separate ≥32-character secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
- **Transport**: both tokens are set as `HttpOnly` cookies (`pb_access`, `pb_refresh`) with configurable `Secure`/`SameSite`; a readable `pb_csrf` cookie is issued alongside. Response bodies never contain tokens. `Authorization: Bearer` is also accepted for non-browser clients.
- **Refresh/logout** require the double-submit CSRF header; `requireCsrf` compares cookie and header with `timingSafeEqual`. The SPA refresh cycle is single-flight and never loops (the replayed request is marked `retryAfterRefresh: false`).
- **Password storage**: bcrypt with `BCRYPT_ROUNDS` (default 12); `passwordHash` is `select: false`.
- **Recovery & verification**: single-use tokens in `AuthToken`, persisted only as SHA-256 hashes with TTLs (`EMAIL_VERIFICATION_TOKEN_TTL_MINUTES`=1440, `PASSWORD_RESET_TOKEN_TTL_MINUTES`=60); consumption sets `consumedAt` so a replay fails. Sign-in is refused until the address is verified when `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (default).
- **Sessions**: `AuthSession` stores the refresh-token **hash**, expiry (TTL-cleaned), revocation timestamp, user agent and IP; users can list and revoke their sessions.
- **Admin bootstrap**: `ensureAdminUser` upserts `ADMIN_EMAIL`/`ADMIN_PASSWORD` as a trusted, verified `admin` on every boot (idempotent).
- **Gate**: `authenticate()` populates `request.user` or rejects with 401; `optionalAuth()` attaches a valid session but never rejects.

## Authorization

Two tiers with domain scoping (`apps/api/src/types/enums.ts`):

- Roles: `customer` (default for self-service registration), `venue_owner`, `venue_staff`, `admin`.
- `authorize(...roles)` always runs after `authenticate()`: missing session → **401**, wrong role → **403** (never inverted).
- **Ownership checks** are separate from role checks and live in services, adapted by `middleware/authorization.ts`:
  - `requireVenueAccess()` → venue owner, active assigned staff, or admin.
  - `requireBookingAccess()` → booking owner, owner of its venue, active staff of its venue, or admin.
  - `requireSelf` / `requireSelfOrAdmin` guard `/me`-style identifiers.
- Admin-only surfaces (`/api/v1/admin/*`, the user directory, review moderation, payment reconciliation) require the `admin` role; every administrative status action requires a `reason` and writes an audit-log entry (actor, action, resource, request ID, metadata).

## Booking System

Booking is a two-phase state machine: **hold → (payment) → confirmed → completed/cancelled/no_show**.

1. **Availability** — `GET /api/v1/courts/:venueId/pitches/:pitchId/availability?date=YYYY-MM-DD&durationMinutes=60` computes open windows from `AvailabilityRule` (weekly hours), `AvailabilityException` (`blackout` closes a date, `special_open` overrides it), the court's `bufferBeforeMinutes`/`bufferAfterMinutes` and `slotIncrementMinutes`, then subtracts overlapping active bookings and unexpired inventory rows. Each returned interval carries venue-local start/end strings, the timezone, and a price chosen by `selectPriceRule` (highest-priority active `PriceRule` matching weekday, minute-of-day, date range and duration).
2. **Hold** — `POST /api/v1/holds` (customer role, CSRF-protected, optional `idempotencyKey`) re-verifies availability and creates a booking with `status: held`, `holdExpiresAt = now + BOOKING_HOLD_MINUTES` (default 10, max 60) and a snapshot of the cancellation policy.
3. **Payment** — `POST /api/v1/payments/bookings/:bookingId/attempts` (requires the `Idempotency-Key` header) creates a `pending` payment attempt through the configured provider adapter.
4. **Confirm** — `POST /api/v1/holds/:bookingId/confirm` requires an unexpired hold **and** a `paid` payment attempt whose `amountMinor`/`currency` match the booking; it sets `status: confirmed`, `paymentStatus: paid`, clears `holdExpiresAt`, and pins the inventory rows' `expiresAt` to `9999-12-31` so TTL never reclaims them.
5. **Cancellation** — `POST /api/v1/bookings/:bookingId/cancel` requires a reason. `cancelled`, `completed` and `no_show` bookings cannot be cancelled. The refund percentage comes from the immutable `cancellationPolicy` snapshot captured at hold time (`freeUntilMinutesBefore`, `refundPercent`); if the cutoff has passed, the refund is 0. Operator cancellations (owner/staff/admin) are audited separately from customer cancellations.
6. **Completion / no-show** — operational status transitions are performed through admin/operator surfaces with a reason and an audit entry.

Reads: customers list bookings via `GET /api/v1/bookings` (filters: `status`, `from`/`to`, `venueId`, `sort`); operators use the venue calendar `GET /api/v1/courts/:venueId/calendar?from=<ISO>&to=<ISO>`.

## Double Booking Prevention

Four independent layers, so no single failure can double-sell a court:

1. **Availability re-check inside the transaction** — `createBookingHold` re-runs `calculateAvailability` for the venue-local date and only proceeds if the exact requested `startAt` is still offered (`409` otherwise).
2. **MongoDB transaction** — the conflict query and all writes run inside `mongoose.startSession().withTransaction()`. The conflict query looks for any booking on the same `pitchId` whose interval overlaps the **buffer-expanded** window (`startAt < occupiedEnd && endAt > occupiedStart`) among bookings that still occupy inventory (`activeBookingFilter`: `confirmed`/`pending` always, `held` only until `holdExpiresAt`).
3. **Unique slot inventory** — one `BookingInventory` row is inserted per slot boundary touched (buffers included) in the same transaction; the unique index on `(pitchId, slotStartAt)` makes a second concurrent hold fail with E11000, which `translateTransactionError` converts to `409 The requested interval is no longer available`. A duplicate-key race therefore never surfaces as a 500.
4. **TTL expiry** — inventory rows carry `expiresAt` (the hold expiry). Abandoned holds are deleted explicitly before re-insertion and are also removed automatically by the TTL index; `activeBookingFilter` and availability queries ignore expired holds even before TTL cleanup runs.

**Replica-set requirement**: if transactions are unsupported the API fails closed with `503 TRANSACTIONS_REQUIRED` instead of degrading to unsafe writes. Confirmation additionally refuses to promote a hold without a matching verified payment.

## Payment System

- **No live provider is configured by default.** `PAYMENT_PROVIDER` accepts only `unselected` (every attempt fails closed) or `development_mock` (a local adapter that creates `pending` attempts and accepts only HMAC-SHA256-signed test webhooks built from `PAYMENT_WEBHOOK_SECRET`). It never processes cards.
- **Provider abstraction**: `services/paymentProvider.service.ts` exposes `createPayment`, `createRefund` and webhook verification behind a `PaymentProviderAdapter` interface. A real provider adapter replaces the development verifier with that provider's official SDK signature check. Stripe environment placeholders exist in `.env.example`, but no Stripe code path is invoked.
- **Idempotency**: payment attempts are unique on `(bookingId, idempotencyKey)`, refunds on `(bookingId, idempotencyKey)`; retried requests return the existing record instead of charging twice.
- **Webhooks**: `POST /api/v1/payments/webhook` is unauthenticated by session — authenticity comes from the raw body (`express.json({ verify })` captures `request.rawBody`) checked against the `payment-signature`/`stripe-signature` header. Events are deduplicated on `(provider, eventId)` in `PaymentWebhookEvent`, and amounts/currency are compared with the trusted booking snapshot (`paymentMatchesSnapshot`) before any status transition.
- **Status mapping**: `payment.succeeded → paid`, `payment.failed → failed`, anything else → `uncertain`. A booking cannot become `confirmed` without a paid attempt matching amount and currency (`assertPaidAttempt`).
- **Reconciliation**: `POST /api/v1/payments/reconcile` (admin) flags `pending` attempts older than `PAYMENT_PENDING_TIMEOUT_MINUTES` (default 30) as `uncertain` and mirrors that onto the booking, so nothing is silently stuck.
- **Refunds**: `POST /api/v1/bookings/:bookingId/refunds` (venue owner/admin) validates amount and currency against a `paid` attempt, moves `requested → processing`, and only becomes `succeeded` after a verified provider webhook; failures remain visible with `failureReason`. `PAYMENT_MAX_REFUND_ATTEMPTS` (default 3) caps retries.

## Notification System

Transactional outbox pattern (`services/notifications.service.ts`):

- **Enqueue** — booking, payment and auth flows call `enqueueNotification` with a `deduplicationKey`. Writes are non-blocking: a failure is logged and never propagated (booking flows must not fail because mail is down), and duplicate keys are treated as success via the unique index.
- **Inbox** — every user has an in-app inbox: `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /:notificationId/read`, `POST /api/v1/notifications/read-all`, `DELETE /:notificationId`.
- **Delivery** — a worker drains `queued` rows whose `nextAttemptAt` has passed, in batches of `NOTIFICATION_BATCH_SIZE` (default 50), through a `NotificationTransport`. The default `DevelopmentNotificationTransport` is explicitly named `development_logger` and redacts bodies, so production can never mistake a console line for a delivered message. Failures retry with exponential backoff (`2^attemptCount` seconds, capped at 1 h) and become `failed` after `NOTIFICATION_MAX_ATTEMPTS` (default 5).
- **Invocation** — call `processNotificationOutbox()` from a scheduler/worker, or trigger `POST /api/v1/admin/notifications/process` (admin, rate-limited to 5 requests per window).
- **Types/channels** — `booking_confirmed`, `booking_cancelled`, `booking_reminder`, `payment_failed`, `refund_updated`, `email_verification`, `password_reset`, `general` over `email`/`push`/`sms`.

## API Versioning

- Every endpoint is mounted under `config.apiPrefix`, built from `API_VERSION` (validated `^v\d+$`, default `v1`) → **`/api/v1/...`**; `API_PREFIX` can override the entire prefix.
- The version is fixed at process start and baked into routing — changing it is a new deployment, not a runtime flag clients must agree on.
- **Compatibility aliases** keep old clients working without duplicating handlers: `/api/v1/venues` mounts the same router as `/api/v1/courts`, and `/api/v1/admin/venues/...` mirrors `/api/v1/admin/courts/...`.
- Breaking changes require a `/api/v2` router mounted alongside v1 (register it in `src/routes/index.ts` and increment `API_VERSION`); additive changes stay within v1.
- Pagination responses carry a canonical `meta` block plus legacy flat `total`/`page`/`limit` fields (`withLegacyPagination`) so existing clients keep working.

## API Documentation

- **Full reference**: [docs/api/api-documentation.md](docs/api/api-documentation.md) — every route group, auth/CSRF/idempotency requirements, request and response envelopes, error codes and examples.
- **Architecture notes**: [docs/architecture/api-architecture.md](docs/architecture/api-architecture.md) — middleware pipeline, versioning and envelope design.
- **Self-describing source**: each router file documents its surface inline, and `apps/api/src/routes/index.ts` carries the canonical route map.
- **Live**: `GET /api/v1/health` (light) and `GET /api/v1/health/detailed` (dependency diagnostics) return the standard success envelope.

## Environment Variables

`.env.example` is the source of truth; copy it to `.env` at the repository root (git-ignored). The API loads `.env` from the working directory first, then the repository root, so both `npm run dev --workspace=apps/api` and `npm run db:seed` read the same file. All values are validated by the Zod schema in `apps/api/src/config/index.ts`; the process refuses to start on invalid configuration.

**Required:**

| Variable             | Notes                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `MONGODB_URI`        | Connection string (default `mongodb://localhost:27017/pickleball_booking`) |
| `JWT_SECRET`         | Access-token signing secret, **≥ 32 characters**                           |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret, **≥ 32 characters**                          |

**Application**: `NODE_ENV`, `PORT` (4000), `API_VERSION` (`v1`), `API_PREFIX`, `FRONTEND_URL`, `BODY_LIMIT` (100kb), `PAGINATION_DEFAULT_LIMIT`/`PAGINATION_MAX_LIMIT`.

**Auth/session**: `JWT_EXPIRES_IN` (15m), `JWT_REFRESH_EXPIRES_IN` (7d), `BCRYPT_ROUNDS` (12), `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`, `AUTH_ACCESS_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_NAME`, `AUTH_CSRF_COOKIE_NAME`, `AUTH_ACCESS_COOKIE_MAX_AGE_MS`, `AUTH_REFRESH_COOKIE_MAX_AGE_MS`, `AUTH_REQUIRE_EMAIL_VERIFICATION` (true), `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` (1440), `PASSWORD_RESET_TOKEN_TTL_MINUTES` (60).

**Booking/payments**: `BOOKING_HOLD_MINUTES` (10), `PAYMENT_PROVIDER` (`unselected` | `development_mock`), `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_PENDING_TIMEOUT_MINUTES` (30), `PAYMENT_MAX_REFUND_ATTEMPTS` (3), `STRIPE_*` placeholders (unused until an adapter exists).

**Rate limiting**: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS` (900000), `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_AUTH_MAX_REQUESTS` (10), `RATE_LIMIT_WRITE_MAX_REQUESTS` (60), `RATE_LIMIT_PASSWORD_RECOVERY_MAX_REQUESTS` (5).

**Notifications/e-mail/infra**: `NOTIFICATION_MAX_ATTEMPTS` (5), `NOTIFICATION_BATCH_SIZE` (50), `SMTP_*`, `EMAIL_FROM`, `AWS_*` (placeholders), `LOG_LEVEL`, `LOG_FORMAT`.

**Bootstrap/seeding**: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (override both in production), `SEED_*` variables for `npm run db:seed`.

**Web (build-time)**: `VITE_API_URL` (optional; same-origin `/api/v1` when unset), `VITE_CSRF_HEADER_NAME`.

Config cross-checks: `AUTH_COOKIE_SAME_SITE=none` requires `AUTH_COOKIE_SECURE=true`, production requires `AUTH_COOKIE_SECURE=true`, and `PAGINATION_DEFAULT_LIMIT` may not exceed `PAGINATION_MAX_LIMIT`.

## Installation

```bash
# Prerequisites: Node.js >= 20, npm >= 10, MongoDB >= 6 (or Docker)
git clone https://github.com/aadarshvishwakarma32-byte/book-Court.git
cd book-Court

# Install all workspace dependencies
npm install

# Create your environment file
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edit `.env` and set at least `MONGODB_URI`, a `JWT_SECRET` and a `JWT_REFRESH_SECRET` of 32+ characters. Never commit `.env` or real provider credentials.

## Development Setup

```bash
# Option A — Dockerised MongoDB (requires MONGO_INITDB_ROOT_PASSWORD in .env):
docker-compose up -d mongodb          # bound to 127.0.0.1:27017

# Option B — local MongoDB on mongodb://localhost:27017

# Run API and web together
npm run dev
```

`npm run dev` uses `concurrently` to start both workspaces. The Vite dev server proxies `/api` to `http://localhost:4000`, so no CORS configuration is needed locally.

## Database Setup

```bash
# Start MongoDB (Docker) — requires MONGO_INITDB_ROOT_PASSWORD in .env
docker-compose up -d mongodb

# Idempotent seeds (run after MongoDB is reachable)
npm run db:seed        # admin bootstrap + one venue owner + one venue from SEED_* vars
npm run db:seed:court  # fully populated demo venue (courts, operating hours, pricing)
```

- Indexes are created by Mongoose at startup (`autoIndex` is disabled when `NODE_ENV=production` — build them against staging first).
- **Booking holds require a replica set** (MongoDB transactions). On a standalone `mongod`, reads work but hold creation fails closed with `503 TRANSACTIONS_REQUIRED`. Use a replica set, or MongoDB Atlas, for booking flows.
- `SEED_OWNER_PASSWORD_HASH` must be produced by the application password service (bcrypt), never stored as a plaintext seed value.
- The schema-change policy and index reference live in `database/README.md`.

## Running Backend

```bash
npm run dev:api        # tsx watch src/server.ts → http://localhost:4000
npm run build:api      # esbuild bundle → apps/api/dist/server.js
npm run start:api      # node dist/server.js
```

Health check: `curl http://localhost:4000/api/v1/health`.

## Running Frontend

```bash
npm run dev:web                    # Vite dev server → http://localhost:5173 (proxies /api to :4000)
npm run build:web                  # tsc && vite build → apps/web/dist
npm run preview --workspace=apps/web   # serve the production bundle locally
```

## Running Tests

```bash
npm run test              # all workspaces (API + web)
npm run test:coverage     # V8 coverage reports per workspace

# Per workspace
npm run test --workspace=apps/api     # Vitest + Supertest + mongodb-memory-server
npm run test --workspace=apps/web     # Vitest + Testing Library (jsdom)
npm run test:watch --workspace=apps/api
```

API suites boot an in-memory MongoDB where needed (`hookTimeout` 120 s); CI additionally provisions a real `mongo:7.0` service. Rate limiting is skipped in the `test` environment so suites do not share a single window.

## Linting

```bash
npm run lint        # ESLint 9 flat config across all workspaces
npm run lint:fix    # auto-fix
npm run typecheck   # tsc --noEmit in every workspace
```

Rules live in `eslint.config.js`: `typescript-eslint` recommended, `consistent-type-imports`, sorted imports (`simple-import-sort`), unused args/vars prefixed `_` ignored, React Hooks rules for `apps/web`, and `eslint-config-prettier` applied last so formatting is never double-enforced.

## Formatting

```bash
npm run format        # Prettier --write over ts/tsx/js/json/md/yml/css
npm run format:check  # verification only (used by CI)
```

Settings (`prettier.config.js`): single quotes, semicolons, 2-space indent, `printWidth: 100`, `trailingComma: es5`, LF endings. `.prettierignore` excludes generated output; `.editorconfig` covers editors that do not run Prettier.

## Docker

```bash
cp .env.example .env    # then set MONGO_INITDB_ROOT_PASSWORD, JWT_SECRET,
                        # JWT_REFRESH_SECRET, ADMIN_PASSWORD (all required by compose)

docker-compose up -d --build
# → web  http://localhost:8080  (nginx: SPA + /api/ reverse proxy)
# → api  http://localhost:4000  (localhost-bound)
# → mongo on 127.0.0.1:27017 (authenticated)

docker-compose --profile tools up -d   # optional mongo-express admin UI on :8081
```

- **`docker/api.Dockerfile`** — multi-stage (`base` → `prod-deps` → `deps` → `build` → `runtime`): production-only `npm ci --omit=dev`, esbuild bundle to `dist/server.js`, then `node:20-alpine` running as the non-root `node` user with `dumb-init` as PID 1 so SIGTERM reaches the graceful-shutdown handlers. Includes a `HEALTHCHECK` against `/api/v1/health`. No secret is baked into any layer (`.dockerignore` blocks `.env*`).
- **`docker/web.Dockerfile`** — `tsc && vite build`, then nginx serves `dist/` and reverse-proxies `/api/` using `API_UPSTREAM_HOST`/`API_UPSTREAM_PORT` rendered by `envsubst` (`NGINX_ENVSUBST_FILTER=^API_UPSTREAM_` keeps nginx runtime variables intact). `VITE_API_URL` is a build-time argument defaulting to same-origin `/api/v1`.
- **`docker/nginx.conf`** — SPA history fallback, `no-cache` for `index.html`, 1-year immutable caching for `/assets/`, gzip, `/healthz` probe, server tokens off.
- Compose services declare health checks and dependencies (`api` waits for a healthy `mongodb`; `web` waits for a healthy `api`), run with `no-new-privileges`, and never expose the database outside localhost.

## CI/CD

Workflows in `.github/workflows/`:

**`ci.yml`** (push/PR to `main`/`develop`; concurrency cancels superseded runs):

1. `typecheck` — `npm run typecheck`
2. `eslint` — `npm run lint`
3. `prettier` — `npm run format:check`
4. `test-api` — API tests against a `mongo:7.0` service container (`NODE_ENV=test`, test JWT secrets)
5. `test-web` — web tests
6. `build` — `npm run build`, uploads `apps/api/dist` and `apps/web/dist` artifacts (7-day retention)
7. `docker` — validates `docker-compose.yml`, builds both images (GHA cache), smoke-tests the API container by polling `/api/v1/health`

**`security.yml`** (push/PR + weekly cron 03:17 UTC): `npm audit --omit=dev --audit-level=high` (release-blocking) plus an informational full audit, CodeQL (`javascript-typescript`, security-and-quality), Trivy image scan (SARIF upload, fails on CRITICAL), and Gitleaks secret scanning over full history with an explicit "no `.env` is tracked" assertion.

**`cd.yml`** (push to `main`, version tags `v*.*.*`, manual dispatch):

1. `verify` — asserts a **successful CI run exists for the exact commit** before anything publishes
2. `build` — builds and pushes `ghcr.io/<owner>/pickleball-{api,web}` (branch/tag/sha/`latest` tags), then re-scans the published image
3. `deploy` — protected GitHub environment (`staging`/`production`), SSHs to the host and runs `docker compose --env-file .env.production pull/up` with the new image tags; secrets live on the server, never in the workflow
4. `rollback` — on deploy failure, redeploys the previous tag (`vars.PREVIOUS_DEPLOY_TAG`)

## Security

- **Headers**: Helmet with a locked-down CSP (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`), `Referrer-Policy: no-referrer`, HSTS in production, `X-Powered-By` disabled.
- **CORS**: single origin (`FRONTEND_URL`) with credentials; allowed headers include `X-Request-ID`, the CSRF header and the idempotency header.
- **Sessions**: `HttpOnly`/`Secure`/`SameSite` cookies, ≥32-character separate signing secrets, short access TTL, hashed refresh tokens in `AuthSession` with revocation, double-submit CSRF compared with `timingSafeEqual`.
- **Input**: Zod validation on every body/query/params object; unknown keys stripped; operator-shaped input rejected; sort fields whitelisted; regexes escaped. `mongoose.sanitizeFilter` is intentionally off (documented in `config/database.ts`) because injection is prevented at the validator boundary instead.
- **Rate limiting**: a global limiter, a shared credential limiter across register/login/verify (10/window), a tighter recovery limiter (5/window), a write limiter (60/window) and ad-hoc admin limiters (seed 2, outbox 5). Draft-7 `RateLimit-*` headers are returned; limiters are skipped entirely in the test environment.
- **Body limits**: JSON capped at `BODY_LIMIT` (100kb) with raw-body capture for provider webhooks.
- **Money/webhooks**: integer minor units, snapshot amount/currency verification, HMAC/SDK signature verification, webhook deduplication and idempotency keys everywhere money moves.
- **Supply chain**: CodeQL, Trivy (images), Gitleaks (history), `npm audit`, pinned GitHub Action versions.
- **Containers**: non-root users, `no-new-privileges`, no secrets in image layers, MongoDB bound to localhost and authenticated by default.
- **Data exposure**: admin exports omit e-mail, phone, password hashes, tokens and provider credentials; `passwordHash`, `refreshTokenHash` and `tokenHash` are `select: false`.

## Deployment

Two documented paths:

1. **Render** (`render.yaml` blueprint): `pickleball-api` as a Node web service (`npm install && npm run build:api` / `npm run start:api`, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=none`, generated JWT secrets, external `MONGODB_URI`/`FRONTEND_URL`), and `pickleball-web` as a static site publishing `apps/web/dist` with an SPA rewrite to `/index.html`.
2. **Docker + SSH (CD workflow)**: the server holds `.env.production` and runs `docker compose`; GitHub Actions pushes tagged images to GHCR and replaces them on the host. Rollback redeploys the previous tag.

Production checklist and operational runbook: [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md).

## Troubleshooting

| Symptom                                                                         | Cause & fix                                                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Process exits at boot with a Zod error naming `JWT_SECRET`/`JWT_REFRESH_SECRET` | Secrets are shorter than 32 characters or missing; set both in `.env`                                                          |
| `AUTH_COOKIE_SECURE must be true in production`                                 | Set `AUTH_COOKIE_SECURE=true` (required whenever `NODE_ENV=production` or `SameSite=none`)                                     |
| `503 TRANSACTIONS_REQUIRED` on `POST /api/v1/holds`                             | MongoDB has no transaction support — run a replica set or Atlas                                                                |
| `429 AUTH_RATE_LIMITED` / `RATE_LIMIT_EXCEEDED`                                 | Shared window per IP; wait for `RateLimit-Reset` or raise the `RATE_LIMIT_*` values                                            |
| `403 CSRF validation failed` on writes                                          | Ensure the client echoes the `pb_csrf` cookie in the `X-CSRF-Token` header                                                     |
| `409 The requested interval is no longer available`                             | Slot genuinely taken or an expired hold not yet TTL-cleaned; refresh availability                                              |
| `401` from `GET /auth/me` right after registering                               | `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and the address is unverified — complete verification                                   |
| Web app can't reach the API                                                     | Dev proxy targets `http://localhost:4000`; in Docker nginx proxies `/api/`; for split origins set `VITE_API_URL`               |
| `ECONNREFUSED` to MongoDB                                                       | Start MongoDB (`docker-compose up -d mongodb`) and verify `MONGODB_URI`                                                        |
| Notification messages never deliver                                             | Only `processNotificationOutbox()` drains the outbox — run a worker or the admin endpoint, and configure a transport           |
| Seed fails with `Missing seed environment variable`                             | Provide the required `SEED_*` values (see `.env.example`)                                                                      |
| Compose refuses to start                                                        | `MONGO_INITDB_ROOT_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PASSWORD`, `MONGO_EXPRESS_PASSWORD` are `:?`-required |

Useful diagnostics: `GET /api/v1/health/detailed`, `GET /api/v1/admin/database` (admin), Pino logs correlated by `X-Request-ID`, `docker compose ps` / `docker compose logs api`.

## Contribution Guidelines

1. Branch from `main`; keep changes focused and open a PR against `main` or `develop`.
2. Before pushing: `npm run typecheck && npm run lint && npm run format:check && npm run test` must all pass — CI runs exactly these.
3. **TypeScript strict, no `any`**; explicit return types on exported functions; use `type` imports (`consistent-type-imports`).
4. Follow the layering: routes → controllers → services → models. Add Zod validation for every new input and a whitelist entry for any new sort field.
5. Errors: throw `ApiError` from services; never leak stack traces or driver internals; respond only through `sendSuccess`/`sendCreated`/`sendAccepted`/`sendNoContent`.
6. Tests accompany behaviour changes — API integration tests with the in-memory Mongo helper (`tests/helpers/test-db.ts`), UI tests with Testing Library. Cover failure paths, not only happy paths.
7. Money stays in integer minor units; never introduce floats or currency-less amounts.
8. Document schema/index changes and any backfill in `database/README.md`; document new environment variables in `.env.example` **and** in this README.
9. Never commit `.env`, secrets, credentials, `node_modules/` or `dist/`.

## Git Commit Convention

- **Imperative mood, capitalized subject, no trailing period**, one line of ~72 characters describing the change:
  - `Add quick start section to README`
  - `Fix backend ES module bundling and node engines`
  - `Remove owner workspace, owner setup page, and venue owner links`
- Optionally a blank line then a body explaining _why_ the change was needed.
- Optional scope prefixes (`api:`, `web:`, `docs:`, `chore:`) are welcome for clarity, but the repository does not enforce Conventional Commits.
- Husky is installed via the root `prepare` script; add hook scripts under `.husky/` if your workflow requires pre-commit checks.

## License

MIT — see [LICENSE](LICENSE).
