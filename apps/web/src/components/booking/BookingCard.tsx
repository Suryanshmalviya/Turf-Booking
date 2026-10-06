import { Link } from 'react-router-dom';

import type { Booking } from '../../types/booking';
import {
  BOOKING_STATUS_TONE,
  bookingStatusLabel,
  PAYMENT_STATUS_TONE,
  paymentStatusLabel,
} from '../../types/booking';
import { cn } from '../../utils/cn';
import { durationMinutes, formatDateTime, formatDuration, formatMoney } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

export interface BookingCardProps {
  booking: Booking;
  /** Venue and court names, resolved separately — bookings do not embed them. */
  venueName?: string;
  /** Overrides the destination, used by the admin console. */
  to?: string;
}

/**
 * One row in a booking list.
 *
 * Bookings are stored with `venueId`/`pitchId` only, so the display name is
 * passed in by the caller from the cached venue detail. When it has not loaded
 * yet the row falls back to ids rather than rendering a blank heading.
 */
export function BookingCard({ booking, venueName, to }: BookingCardProps) {
  const minutes = durationMinutes(booking.startAt, booking.endAt);
  const title = venueName ?? 'Court booking';

  return (
    <Link
      to={to ?? `/bookings/${booking._id}`}
      className="card block p-5 transition hover:border-primary-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateTime(booking.startAt)} · {booking.timezone}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {formatDuration(minutes)} · {formatMoney(booking.amountMinor, booking.currency)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>
            {bookingStatusLabel(booking.status)}
          </Badge>
          <span className="text-xs text-gray-400">{booking.publicReference}</span>
        </div>
      </div>
    </Link>
  );
}

export interface BookingSummaryCardProps {
  booking: Booking;
  venueName?: string;
  pitchName?: string;
  className?: string;
}

/** Header block for the booking detail view. */
export function BookingSummaryCard({
  booking,
  venueName,
  pitchName,
  className,
}: BookingSummaryCardProps) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700">
            Booking detail
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{venueName ?? 'Court booking'}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {booking.publicReference}
            {pitchName ? ` · ${pitchName}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>
            {bookingStatusLabel(booking.status)}
          </Badge>
          <Badge tone={PAYMENT_STATUS_TONE[booking.paymentStatus]}>
            {paymentStatusLabel(booking.paymentStatus)}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

/** Timing recap shared by the detail and confirmation views. */
export function BookingFacts({ booking, className }: { booking: Booking; className?: string }) {
  const minutes = durationMinutes(booking.startAt, booking.endAt);

  return (
    <dl className={cn('grid gap-4 sm:grid-cols-2', className)}>
      <Fact label="Starts" value={formatDateTime(booking.startAt)} />
      <Fact label="Ends" value={formatDateTime(booking.endAt)} />
      <Fact label="Duration" value={formatDuration(minutes)} />
      <Fact label="Timezone" value={booking.timezone} />
      <Fact label="Amount" value={formatMoney(booking.amountMinor, booking.currency)} />
      <Fact label="Reference" value={booking.publicReference} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}

/** Prompt shown when a booking detail is missing, used by both routes. */
export function BookingNotFound() {
  return (
    <Card className="text-center">
      <p className="text-sm text-gray-600">We could not find that booking.</p>
      <Link
        to="/bookings"
        className="mt-3 inline-block font-semibold text-primary-700 hover:underline"
      >
        Back to your bookings
      </Link>
    </Card>
  );
}
