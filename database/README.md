# Database

This directory holds database-facing assets and documentation for the
Pickleball Booking platform.

Runtime collections are defined as Mongoose models in
`apps/api/src/models/`. Schema changes are delivered as versioned application
changes: add/change a Mongoose model, add any required index, and document a
backfill here before deploying. Index creation is managed by Mongoose at
startup; run index changes against a staging database first.

## Seed scripts

Idempotent seed scripts live in `../scripts/`:

```bash
npm run db:seed        # upsert one venue owner + venue from SEED_* variables
npm run db:seed:court  # upsert a fully populated demo venue (courts, hours, pricing)
```

## Index reference

| Collection              | Index                                             | Purpose                                                |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `AvailabilityRule`      | `(venueId, dayOfWeek, isActive, startMinute)`     | Weekly schedule reads for one venue/day in time order  |
| `AvailabilityException` | `(venueId, date, startMinute)`                    | One venue override per calendar date                   |
| `Booking`               | `(venueId, startAt, endAt, status)`               | Venue date-window scans to detect overlapping bookings |
| `Booking`               | `(userId, startAt, status)`                       | A user's booking history                               |
| `BookingInventory`      | `(pitchId, slotStartAt)` unique + `expiresAt` TTL | Atomic overlap guard + automatic expired-hold cleanup  |
| `Booking`               | `(userId, idempotencyKey)` unique sparse          | Idempotent booking holds                               |
| `PaymentAttempt`        | `(bookingId, idempotencyKey)` unique              | Idempotent payment attempts                            |
| `PaymentWebhookEvent`   | `(provider, eventId)` unique                      | Webhook deduplication                                  |
| `AuthSession`           | `refreshTokenHash` unique + `expiresAt` TTL       | Hashed refresh-session storage + expiry cleanup        |
| `User`                  | `email` unique                                    | Account lookup                                         |
| `Venue`                 | `location` 2dsphere, `(status, name)`             | Geo + published-venue listing                          |

## Transactions

Booking holds and confirmations require MongoDB transactions and therefore a
replica set (or a MongoDB deployment that supports transactions).
