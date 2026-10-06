# System Architecture

This document describes how Pickleball Booking is assembled at runtime. It reflects the actual code in `apps/api`, `apps/web` and `packages/shared`.

## High-level view

```
┌──────────────────────────────┐
│  React SPA (apps/web)        │  Vite build → static assets (nginx / Render static)
│  TanStack Query + Zustand    │
└──────────────┬───────────────┘
               │ fetch, cookies (HttpOnly), X-CSRF-Token, Idempotency-Key
               │ same-origin /api/v1  (Vite dev proxy, or nginx reverse proxy)
┌──────────────▼───────────────┐
│  Express API (apps/api)      │  stateless, scales horizontally
│  Zod validation → RBAC →     │
│  services → Mongoose         │
└──────────────┬───────────────┘
               │ MongoDB driver (replica set: transactions + TTL)
┌──────────────▼───────────────┐
│  MongoDB 7                   │  17 collections, unique + TTL indexes
└──────────────────────────────┘
```

Two rules hold everywhere:

1. The browser never touches the database and never computes an authoritative price or availability decision.
2. Any operation that could be unsafe without coordination (holds, confirmations, refunds) either runs in a MongoDB transaction or is protected by a unique index.

## Repository layout

npm workspaces (`package.json` → `workspaces: ["apps/*", "packages/*"]`):

| Workspace         | Package              | Dev command               | Build                                                |
| ----------------- | -------------------- | ------------------------- | ---------------------------------------------------- |
| `apps/api`        | `@pickleball/api`    | `tsx watch src/server.ts` | esbuild → `dist/server.js` (ESM, node20)             |
| `apps/web`        | `@pickleball/web`    | `vite`                    | `tsc && vite build` → `dist/`                        |
| `packages/shared` | `@pickleball/shared` | —                         | consumed as TypeScript source (`main: src/index.ts`) |

Root scripts orchestrate everything (`npm run dev` starts API + web via `concurrently`; `npm run test/lint/typecheck/format` fan out with `--workspaces --if-present`).

## Request lifecycle (API)

`apps/api/src/app.ts` builds the pipeline in this exact order:

1. **`requestId()`** — honours an inbound `X-Request-ID`, otherwise generates a UUID; echoed on the response and in every log line.
2. **`applySecurity()`** — disables `X-Powered-By`, applies Helmet (CSP `default-src 'none'`, `frame-ancestors 'none'`, HSTS in production), CORS restricted to `FRONTEND_URL` with credentials, and gzip compression.
3. **Body parsers** — `express.json` with `BODY_LIMIT` and a `verify` hook that captures `rawBody` (required by payment webhook signatures), `express.urlencoded`, `cookie-parser`.
4. **`requestLogger()`** — Pino access log.
5. **Global rate limiter** — `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_MS`, skipped in tests.
6. **Versioned router** — everything mounted at `config.apiPrefix` (`/api/v1`).
7. **`notFoundHandler`** then **`errorHandler`** — unmatched routes and any thrown `ApiError`/unknown error map to the single failure envelope with the request ID.

`server.ts` runs `startServer()`: `connectDatabase()` → `ensureAdminUser()` (idempotent admin upsert) → `registerShutdownHandlers()` (SIGINT/SIGTERM disconnect, uncaught-exception exit) → `app.listen(PORT)`.

## Module map

| Concern          | Route file                | Service(s)                                                |
| ---------------- | ------------------------- | --------------------------------------------------------- |
| Auth/sessions    | `auth.routes.ts`          | `auth.service`, `auth-token.service`, `auth-mail.service` |
| Profile/sessions | `users.routes.ts`         | `users.service`                                           |
| Venues/courts    | `courts.routes.ts`        | `courts.service`, `availability.service`                  |
| Bookings         | `bookings.routes.ts`      | `bookings.service`                                        |
| Holds            | `holds.routes.ts`         | `bookings.service`                                        |
| Payments         | `payments.routes.ts`      | `payments.service`, `paymentProvider.service`             |
| Reviews          | `reviews.routes.ts`       | `reviews.service`                                         |
| Notifications    | `notifications.routes.ts` | `notifications.service`                                   |
| Admin            | `admin.routes.ts`         | `admin.service`                                           |
| Health           | `health.routes.ts`        | report builder in `validators/health.validator`           |

Route files are the composition root: authentication, role guard, CSRF, Zod validation and ownership guards are declared per endpoint, so the authorization posture of any endpoint is readable without tracing into the service.

## Frontend structure

- `routes/AppRoutes.tsx` — one route table; `RootLayout` → `ProtectedRoute` (customer journey) → `AdminRoute` (console, lazy sections).
- `services/api-client.ts` — sole `fetch` owner: envelope unwrapping, CSRF header, 20 s timeout, single-flight refresh, replay rules.
- `context/` — `AuthProvider` (session), `QueryProvider` (TanStack Query), `ToastProvider`, `ThemeProvider`.
- `store/` — Zustand: `bookingDraft` (availability selection → checkout), `toast`, `theme`, `venueFilter`.
- `hooks/` — feature hooks (`useAuth`, `useBookings`, `useCourts`, `usePayments`, `useAdmin`, `useReviews`, `useNotifications`, `useUsers`, `useToast`, `useCountdown`, `useDebouncedValue`, `useDocumentTitle`).

## Environments

| Environment   | Notes                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `development` | pretty logs, `autoIndex` on, rate limiting on, `development_mock` payments available                   |
| `test`        | rate limiters skipped, in-memory MongoDB in API suites, jsdom for web                                  |
| `production`  | JSON logs, `autoIndex` off, `AUTH_COOKIE_SECURE` mandatory, HSTS on, secrets supplied at run time only |

Configuration is a single validated object (`apps/api/src/config/index.ts`); invalid configuration prevents boot rather than surfacing later as a runtime bug.

## Scaling & operations notes

- The API is stateless (sessions live in MongoDB), so it can be replicated freely. In-memory rate limiting is per-instance — put a shared store or edge limiter in front for multi-instance deployments.
- The notification outbox is drained by an external caller of `processNotificationOutbox()` (admin endpoint or cron). Run one scheduler per queue; deduplication keys make accidental double delivery harmless.
- Expiry relies on MongoDB TTL indexes (≈60 s granularity) plus explicit `activeBookingFilter` predicates, so correctness never depends on TTL timing.
- WebSocket/SSE is intentionally absent; the SPA refetches through TanStack Query, and unread counts come from `GET /api/v1/notifications/unread-count`.
