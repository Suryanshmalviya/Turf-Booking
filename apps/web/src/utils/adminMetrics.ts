/**
 * Dashboard metric derivation.
 *
 * Every figure the console shows is produced here so its provenance is auditable.
 * The admin API is an aggregate report plus a few paged lists — it has no
 * dedicated stats endpoint — so several metrics must be composed from more than
 * one call, and a few cannot be computed exactly at all. Those are represented
 * explicitly rather than being quietly approximated.
 */

import type { AdminBooking, AdminReport, DatabaseStatus } from '../types/admin';
import { formatCount, formatMoney } from '../utils/format';

/** One tile in the dashboard metric grid. */
export interface AdminMetric {
  id: string;
  label: string;
  value: string;
  /** Where the number came from, surfaced as the tile's tooltip/hint. */
  hint: string;
  tone?: 'default' | 'positive' | 'negative';
}

/**
 * Local-day boundaries as ISO instants.
 *
 * The report matches on `startAt`, which is stored as an absolute instant, so
 * "today" has to be anchored to the browser's local midnight rather than UTC —
 * otherwise the count silently drifts for most of the day outside UTC.
 */
export function todayWindow(now = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Open-ended future window starting now, for "upcoming" counts. */
export function upcomingWindow(now = new Date()): { from: string; to: string } {
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  return { from: now.toISOString(), to: end.toISOString() };
}

/** Sum a report's `bookingCounts` buckets into a total across all statuses. */
export function totalBookings(report: AdminReport | undefined): number {
  return report?.bookingCounts.reduce((sum, bucket) => sum + bucket.count, 0) ?? 0;
}

/** Count for one booking status, or `0` when the status is absent. */
export function countForStatus(report: AdminReport | undefined, status: string): number {
  return report?.bookingCounts.find(bucket => bucket._id === status)?.count ?? 0;
}

/**
 * Revenue in the dominant currency, and the net after refunds.
 *
 * Bookings are priced per venue, so a platform can legitimately hold more than
 * one currency. Adding them together would be meaningless, so this returns the
 * currency with the largest gross value and reports that currency's refunds
 * against it. `mixed` flags the case where other currencies hold value too.
 */
export interface RevenueSummary {
  currency: string;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  /** Currencies carrying value that is *not* in `currency`. */
  otherCurrencies: string[];
  mixed: boolean;
}

export function summariseRevenue(report: AdminReport | undefined): RevenueSummary | null {
  const buckets = (report?.grossBookingValue ?? []).filter(bucket => bucket.amountMinor > 0);
  if (buckets.length === 0) return null;

  const dominant = buckets.reduce((best, bucket) =>
    bucket.amountMinor > best.amountMinor ? bucket : best
  );
  const currency = dominant._id;
  const refundedMinor =
    report?.refunds.find(bucket => bucket._id === currency)?.amountMinor ?? 0;

  return {
    currency,
    grossMinor: dominant.amountMinor,
    refundedMinor,
    netMinor: dominant.amountMinor - refundedMinor,
    otherCurrencies: buckets.filter(bucket => bucket._id !== currency).map(bucket => bucket._id),
    mixed: buckets.length > 1,
  };
}

/**
 * Cancellation rate over the report window.
 *
 * Denominator is every booking whose `startAt` falls in the window, so a booking
 * cancelled after its slot has passed still counts — matching the server's own
 * definition of the figure.
 */
export interface CancellationSummary {
  cancelled: number;
  total: number;
  ratePercent: number;
}

export function summariseCancellations(report: AdminReport | undefined): CancellationSummary {
  const total = totalBookings(report);
  const cancelled = report?.cancellations ?? 0;
  return {
    cancelled,
    total,
    ratePercent: total === 0 ? 0 : Math.round((cancelled / total) * 100),
  };
}

/**
 * Court utilisation as booked minutes per venue.
 *
 * The report deliberately does not compute a utilisation *percentage*: doing so
 * needs a denominator of configured operating minutes, which the aggregation does
 * not join in. Presenting booked minutes keeps the figure honest instead of
 * implying a capacity the data cannot support.
 */
export interface UtilizationRow {
  venueId: string;
  bookedMinutes: number;
  bookedHours: number;
  bookings: number;
  avgMinutesPerBooking: number;
}

export function utilisationRows(report: AdminReport | undefined): UtilizationRow[] {
  return (report?.utilization ?? [])
    .filter(row => row.bookedMinutes > 0)
    .sort((left, right) => right.bookedMinutes - left.bookedMinutes)
    .map(row => ({
      venueId: row._id,
      bookedMinutes: row.bookedMinutes,
      bookedHours: Math.round((row.bookedMinutes / 60) * 10) / 10,
      bookings: row.bookings,
      avgMinutesPerBooking: row.bookings === 0 ? 0 : Math.round(row.bookedMinutes / row.bookings),
    }));
}

/**
 * Bookings awaiting payment.
 *
 * A booking is only ever *held* while its payment attempt is outstanding, and
 * `confirmBookingHold` requires a `paid` attempt before flipping to `confirmed`.
 * Counting held bookings is therefore the accurate measure of money in flight —
 * there is no payment-status index to query directly.
 */
export function pendingPaymentCount(report: AdminReport | undefined): number {
  return countForStatus(report, 'held');
}

/**
 * Build the dashboard metric grid.
 *
 * `todayCount` / `upcomingCount` come from the paged bookings list rather than
 * the report, because the report window is closed on both ends and cannot express
 * "everything from now onwards".
 */
export function buildMetrics(input: {
  database?: DatabaseStatus;
  report?: AdminReport;
  todayCount?: number;
  upcomingCount?: number;
  queueCount?: number;
}): AdminMetric[] {
  const { database, report } = input;
  const revenue = summariseRevenue(report);
  const cancellations = summariseCancellations(report);
  const pending = pendingPaymentCount(report);

  return [
    {
      id: 'total-users',
      label: 'Total users',
      value: formatCount(database?.counts.users ?? 0),
      hint: 'Every account, including suspended and deleted.',
    },
    {
      id: 'total-courts',
      label: 'Total courts',
      value: formatCount(database?.counts.pitches ?? 0),
      hint: `Individual playing courts across ${formatCount(database?.counts.venues ?? 0)} venues.`,
    },
    {
      id: 'today-bookings',
      label: "Today's bookings",
      value: formatCount(input.todayCount ?? 0),
      hint: 'Bookings whose start falls on today, in your local timezone.',
    },
    {
      id: 'upcoming-bookings',
      label: 'Upcoming bookings',
      value: formatCount(input.upcomingCount ?? 0),
      hint: 'Bookings starting within the next 12 months, any status.',
    },
    {
      id: 'revenue',
      label: 'Revenue (net)',
      value: revenue ? formatMoney(revenue.netMinor, revenue.currency) : '—',
      hint: revenue
        ? `Gross ${formatMoney(revenue.grossMinor, revenue.currency)} less ${formatMoney(
            revenue.refundedMinor,
            revenue.currency
          )} refunded, from confirmed and completed bookings.${
            revenue.mixed ? ` Other currencies with value: ${revenue.otherCurrencies.join(', ')}.` : ''
          }`
        : 'No confirmed or completed bookings yet.',
      tone: revenue && revenue.netMinor > 0 ? 'positive' : 'default',
    },
    {
      id: 'pending-payments',
      label: 'Pending payments',
      value: formatCount(pending),
      hint: 'Bookings still held because their payment has not settled.',
      tone: pending > 0 ? 'default' : 'positive',
    },
    {
      id: 'cancellations',
      label: 'Cancellations',
      value: formatCount(cancellations.cancelled),
      hint: `${cancellations.ratePercent}% of the ${formatCount(
        cancellations.total
      )} bookings recorded in the reporting window.`,
      tone: cancellations.ratePercent > 20 ? 'negative' : 'default',
    },
    {
      id: 'utilization',
      label: 'Court utilisation',
      value: utilisationRows(report)[0]
        ? `${formatCount(utilisationRows(report)[0].bookedHours)} h busiest`
        : '—',
      hint: 'Booked hours on the busiest court venue. Shown as hours because the API does not compute a capacity percentage.',
    },
    {
      id: 'awaiting-review',
      label: 'Awaiting review',
      value: formatCount(input.queueCount ?? 0),
      hint: 'Courts in draft, pending, rejected or suspended state.',
      tone: (input.queueCount ?? 0) > 0 ? 'default' : 'positive',
    },
  ];
}

/** Status-mix chart rows from the report's `bookingCounts`. */
export function bookingStatusMix(report: AdminReport | undefined) {
  return (report?.bookingCounts ?? [])
    .map(bucket => ({ status: bucket._id, count: bucket.count }))
    .sort((left, right) => right.count - left.count);
}

/** Revenue-per-currency chart rows in major units. */
export function revenueByCurrency(report: AdminReport | undefined) {
  return (report?.grossBookingValue ?? []).map(bucket => ({
    currency: bucket._id,
    gross: bucket.amountMinor / 100,
    bookings: bucket.bookings ?? 0,
  }));
}

/** Utilisation chart rows keyed by a short venue label. */
export function utilisationChartData(report: AdminReport | undefined, labelFor: (id: string) => string) {
  return utilisationRows(report)
    .slice(0, 12)
    .map(row => ({
      venue: labelFor(row.venueId),
      hours: row.bookedHours,
      bookings: row.bookings,
    }));
}

/** Count rows for the dashboard's recent-bookings feed. */
export function recentBookingRows(bookings: AdminBooking[] | undefined, limit = 8): AdminBooking[] {
  return (bookings ?? []).slice(0, limit);
}