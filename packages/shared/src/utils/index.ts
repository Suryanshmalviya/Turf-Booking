export function formatMoney(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function parseMoney(amount: string, currency: string = 'USD'): number {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const parts = formatter.formatToParts(0);
  const decimalSeparator = parts.find(p => p.type === 'decimal')?.value || '.';
  const groupSeparator = parts.find(p => p.type === 'group')?.value || ',';

  const cleanAmount = amount
    .replace(new RegExp(`\\${groupSeparator}`, 'g'), '')
    .replace(new RegExp(`\\${decimalSeparator}`), '.')
    .replace(/[^\d.-]/g, '');

  return Math.round(parseFloat(cleanAmount) * 100);
}

export function formatDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatTime(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

export function formatDateTime(date: Date | string, timeZone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function isValidMongoId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function classNames(...classes: Array<string | undefined | null | false>): string {
  return classes.filter(Boolean).join(' ');
}
