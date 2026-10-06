/** Presentation helpers shared by every page so values format identically. */

const MINUTES_PER_DAY = 1440;

export { DAY_MS } from './date';
export {
  addDays,
  dateRange,
  dayOfMonth,
  formatDateLong,
  formatDayShort,
  formatMonthHeading,
  formatRelative,
  formatWeekday,
  isPastDate,
  isPastTimestamp,
  minutesUntil,
  parseDateKey,
  todayIso,
  toLocalIsoDate,
} from './date';

/** `495` → `"08:15"`. Schedule rules store minutes from midnight. */
export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minute));
  const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mins = String(clamped % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

/** Minor currency units → localised currency, e.g. `1200, 'INR'` → `"₹12.00"`. */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    // Unknown ISO currency code from tenant data — fall back to a plain number.
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * User-entered major units → minor units for the API.
 *
 * The `maxPrice` filter compares against `PriceRule.amountMinor`, so sending the
 * raw "500" would mean ₹5.00. Returns `undefined` for empty input so the query
 * builder omits the filter entirely.
 */
export function majorToMinor(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

export function formatPricePerHour(amountMinor: number, currency: string): string {
  return `${formatMoney(amountMinor, currency)}/hr`;
}

/** Whole minutes between two ISO timestamps. */
export function durationMinutes(startAt: string, endAt: string): number {
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000);
}

/** `90` → `"1h 30m"`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

/** Seconds → `M:SS`, used by the checkout hold countdown. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** `1234` → `"1,234"`, used for record counts. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** Turn a camelCase or snake_case API field into a readable label. */
export function humanizeKey(value: string): string {
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
