/**
 * Date helpers built on `YYYY-MM-DD` local date keys, which is the format the
 * API uses for availability queries. Working in date keys avoids the timezone
 * drift that comes from round-tripping through `Date` and `toISOString`.
 */

const DAY_MS = 86_400_000;

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today in the browser's timezone. */
export function todayIso(): string {
  return toLocalIsoDate(new Date());
}

/** Parse `YYYY-MM-DD` into a local midnight `Date`. */
export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Shift a date key by whole days. */
export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

/** Inclusive list of date keys starting at `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(start, index));
}

/** `true` when the date key is strictly before today. */
export function isPastDate(dateKey: string): boolean {
  return dateKey < todayIso();
}

/** Short weekday + day label, e.g. `"Sat 26"`. */
export function formatDayShort(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

/** Weekday name, e.g. `"Saturday"`. */
export function formatWeekday(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: 'long' });
}

/** Long date label, e.g. `"Sat, 26 Sep 2026"`. */
export function formatDateLong(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Calendar month/year heading, e.g. `"September 2026"`. */
export function formatMonthHeading(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Day-of-month number, e.g. `26`. */
export function dayOfMonth(dateKey: string): number {
  return parseDateKey(dateKey).getDate();
}

/** `true` when the timestamp is in the past. */
export function isPastTimestamp(timestamp: string): boolean {
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? false : parsed <= Date.now();
}

/** Whole minutes from now until the timestamp; negative once it has passed. */
export function minutesUntil(timestamp: string): number {
  return Math.round((new Date(timestamp).getTime() - Date.now()) / 60_000);
}

/** Humanised relative time, e.g. `"in 2 hours"` or `"3 days ago"`. */
export function formatRelative(timestamp: string): string {
  const deltaMinutes = minutesUntil(timestamp);

  if (Math.abs(deltaMinutes) < 1) return 'now';

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(deltaMinutes) < 60) return formatter.format(deltaMinutes, 'minute');

  const hours = Math.round(deltaMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');

  return formatter.format(Math.round(hours / 24), 'day');
}

export { DAY_MS };