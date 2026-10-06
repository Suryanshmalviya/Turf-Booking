export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value.includes('/') || value === 'UTC';
  } catch {
    return false;
  }
}

export function localDateParts(
  date: Date,
  timezone: string
): { weekday: number; minute: number; dateKey: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function zonedDateTimeToUtc(dateKey: string, minute: number, timezone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localDateParts(guess, timezone);
    const actual = new Date(
      `${parts.dateKey}T${String(Math.floor(parts.minute / 60)).padStart(2, '0')}:${String(parts.minute % 60).padStart(2, '0')}:00Z`
    ).getTime();
    const desired = new Date(
      Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60)
    ).getTime();
    const difference = desired - actual;
    if (difference === 0) return guess;
    guess = new Date(guess.getTime() + difference);
  }
  return guess;
}

export function dateKeyToUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const parts = dateKey.split('-').map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('date must use YYYY-MM-DD');
  }
  return { year, month, day };
}

export function formatLocalTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(date);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}
