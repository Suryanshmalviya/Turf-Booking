# Database Design

MongoDB 7 with Mongoose 8. All collections use `{ timestamps: true, versionKey: false }`. Schemas live in `apps/api/src/models/`; this document plus `database/README.md` is the reference for collections, indexes and change policy.

## Design principles

- **Integrity via indexes** — uniqueness and overlap protection are enforced by MongoDB, not only by application code.
- **Money as integers** — every monetary field is `amountMinor: number` (integer, validated) plus `currency: /^[A-Z]{3}$/`. No floating point, ever.
- **Immutable snapshots** — bookings capture `timezone`, `amountMinor`, `currency` and `cancellationPolicy` at hold time so later rule changes cannot rewrite history.
- **Hashed secrets only** — `passwordHash`, `refreshTokenHash` and `tokenHash` are `select: false`; raw tokens exist only in the request/email that delivered them.
- **Expiry via TTL** — `expireAfterSeconds: 0` indexes on `expiresAt` clean up sessions, tokens and inventory rows; query filters additionally ignore expired rows so correctness does not depend on TTL timing.

## Collections & relationships

```
User ──< Venue (ownerId) ──< Pitch (venueId)
  │              │               ├──< AvailabilityRule / AvailabilityException / PriceRule
  │              │               └──< Booking ──< BookingInventory
  │              │                        ├──< PaymentAttempt ──< Refund
  │              │                        └──< Review (one per booking)
  ├──< Booking (userId)
  ├──< AuthSession / AuthToken / Notification / AuditLog
  └──< VenueStaffAssignment (venueId, userId)
```

| Model (`*.model.ts`)          | Collection               | Purpose                                                                                        |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `user.model`                  | `users`                  | Accounts: email (unique), bcrypt hash, role, status, verification state                        |
| `venue.model`                 | `venues`                 | Facilities: owner, IANA timezone, currency, address, geo point, images, moderation state       |
| `pitch.model`                 | `pitches`                | Bookable courts inside a venue: slot increment, before/after buffers, active flag              |
| `availabilityRule.model`      | `availablerules`         | Weekly operating windows (`dayOfWeek`, `startMinute`–`endMinute`)                              |
| `availabilityException.model` | `availabilityexceptions` | Per-date override: `blackout` or `special_open`, optional minute range + reason                |
| `priceRule.model`             | `pricerules`             | Pricing: weekday/minute/date/duration filters, `pricingUnit`, `amountMinor`, `priority`        |
| `booking.model`               | `bookings`               | Reservations: interval, status, payment status, hold expiry, policy snapshot, public reference |
| `bookingInventory.model`      | `bookinginventories`     | One row per occupied slot — the atomic overlap guard, TTL on `expiresAt`                       |
| `paymentAttempt.model`        | `paymentattempts`        | Provider payment attempts: idempotency key, provider id, status, amount snapshot               |
| `paymentWebhookEvent.model`   | `paymentwebhookevents`   | Webhook dedup ledger `(provider, eventId)` + processing outcome                                |
| `refund.model`                | `refunds`                | Refund lifecycle `requested → processing → succeeded/failed`, idempotent                       |
| `review.model`                | `reviews`                | One review per booking, ratings, venue reply, moderation fields                                |
| `notification.model`          | `notifications`          | Outbox + inbox: dedup key, status, backoff counter, read state                                 |
| `authSession.model`           | `authsessions`           | Refresh sessions: hashed token, expiry (TTL), revocation, UA/IP                                |
| `authToken.model`             | `authtokens`             | Single-use verification/reset tokens (SHA-256 hash, TTL, `consumedAt`)                         |
| `auditLog.model`              | `auditlogs`              | Append-only: actor, action, resource, request id, metadata                                     |
| `venueStaffAssignment.model`  | `venuestaffassignments`  | Staff ↔ venue grants for `venue_staff` access                                                  |

## Index reference

| Collection               | Index                                                                                             | Purpose                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `users`                  | `email` unique                                                                                    | Account lookup / registration              |
| `users`                  | `role`, `status`, `emailVerified`                                                                 | Directory filters                          |
| `venues`                 | `location` 2dsphere                                                                               | Geo queries                                |
| `venues`                 | `(status, name)`                                                                                  | Published-venue listing                    |
| `venues`                 | `ownerId`                                                                                         | Owner's venues                             |
| `pitches`                | `(venueId, name)` unique                                                                          | Court names unique per venue               |
| `pitches`                | `(venueId, isActive, sortOrder)`                                                                  | Ordered court lists                        |
| `availablerules`         | `(venueId, dayOfWeek, isActive, startMinute)`                                                     | Weekly schedule reads in time order        |
| `availabilityexceptions` | `(venueId, date, startMinute)`                                                                    | One venue override per calendar date       |
| `pricerules`             | `(venueId, isActive, dayOfWeek, startMinute, priority desc)`                                      | Highest-priority matching rule first       |
| `bookings`               | `publicReference` unique                                                                          | Support lookup by human-readable reference |
| `bookings`               | `(venueId, startAt, endAt, status)`                                                               | Venue date-window overlap scans            |
| `bookings`               | `(userId, startAt desc, status)`                                                                  | Customer history                           |
| `bookings`               | `(userId, idempotencyKey)` unique sparse                                                          | Idempotent holds                           |
| `bookings`               | `pitchId`, `holdExpiresAt`                                                                        | Conflict checks and hold-expiry filters    |
| `bookinginventories`     | **`(pitchId, slotStartAt)` unique**                                                               | Atomic double-booking guard                |
| `bookinginventories`     | `expiresAt` TTL                                                                                   | Automatic reclaim of abandoned holds       |
| `paymentattempts`        | `(bookingId, idempotencyKey)` unique                                                              | Idempotent payment attempts                |
| `paymentattempts`        | `(provider, providerPaymentId)` unique sparse                                                     | Provider idempotency                       |
| `paymentattempts`        | `(status, updatedAt)`                                                                             | Reconciliation scans                       |
| `paymentwebhookevents`   | `(provider, eventId)` unique                                                                      | Webhook deduplication                      |
| `refunds`                | `(bookingId, idempotencyKey)` unique; `providerRefundId` unique sparse                            | Idempotent refunds                         |
| `reviews`                | `(bookingId, userId)` unique                                                                      | One review per booking                     |
| `reviews`                | `(venueId, status, createdAt desc)`, `(venueId, status, rating desc)`, `(userId, createdAt desc)` | Public listing + summaries                 |
| `notifications`          | `deduplicationKey` unique                                                                         | Outbox idempotency                         |
| `notifications`          | `(userId, createdAt desc, status)`, `(userId, readAt, createdAt desc)`                            | Inbox + unread counts                      |
| `authsessions`           | `refreshTokenHash` unique, `sessionId` unique; `expiresAt` TTL; `(userId, revokedAt, expiresAt)`  | Session integrity + cleanup                |
| `authtokens`             | `tokenHash` unique; `expiresAt` TTL; `(userId, purpose, consumedAt)`                              | Single-use token integrity                 |
| `auditlogs`              | `(resourceType, resourceId, createdAt desc)`, `requestId`                                         | Audit trail lookups                        |
| `venuestaffassignments`  | `(venueId, userId)` unique; `(userId, active, venueId)`                                           | Assignment integrity + access checks       |

## The booking overlap model

A booking's occupancy is the interval **plus court buffers** (`bufferBeforeMinutes`/`bufferAfterMinutes`), converted to slot keys derived from `slotIncrementMinutes` (`availability.service.slotKeys`). Each key becomes a `BookingInventory` row:

- The insert happens inside the same transaction as the booking insert.
- The unique `(pitchId, slotStartAt)` index means a concurrent hold for any overlapping interval fails with E11000, which the service maps to HTTP 409.
- On confirmation the rows' `expiresAt` is pinned to `9999-12-31`; on abandonment they expire via TTL.
- Availability reads union two sources: interval overlap against `bookings` (via `activeBookingFilter`) and exact slot hits against unexpired `bookinginventories`.

## Transactions

`createBookingHold` and `confirmBookingHold` run inside `mongoose.startSession().withTransaction()`. This requires a **replica set**; without one the API returns `503 TRANSACTIONS_REQUIRED` rather than performing unsafe writes. Everything else (cancellation, payment webhooks, refunds) uses targeted find-and-update operations with unique-index backstops.

## Migration policy

1. Schema changes ship as versioned application changes: modify the Mongoose model, add/adjust indexes, and document any backfill in `database/README.md` **before** deploying.
2. Mongoose builds indexes at startup; `autoIndex` is disabled when `NODE_ENV=production`, so index changes must be applied to staging first and rolled out deliberately.
3. Backfills must be idempotent and resumable. The seeds (`npm run db:seed`, `npm run db:seed:court`) are the only supported data loaders and are upsert-based.
