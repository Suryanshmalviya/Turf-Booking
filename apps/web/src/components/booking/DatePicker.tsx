import { useEffect, useMemo, useRef } from 'react';

import { cn } from '../../utils/cn';
import {
  addDays,
  dayOfMonth,
  formatDateLong,
  formatDayShort,
  isPastDate,
  todayIso,
} from '../../utils/date';

/** Days offered in the horizontal strip by default. */
const DATE_OPTION_COUNT = 14;

export interface DatePickerProps {
  value: string;
  onChange: (dateKey: string) => void;
  /** How many days to offer, starting today. */
  dayCount?: number;
  /** Enables the left/right arrows that page the strip by `dayCount`. */
  paged?: boolean;
  label?: string;
  className?: string;
}

/**
 * Horizontal date strip.
 *
 * Implements the ARIA listbox pattern: the strip is a single tab stop and the
 * arrow keys move between days, so keyboard users are not forced to tab through
 * fourteen separate buttons. Past days are removed from the DOM entirely rather
 * than being rendered disabled, which keeps the roving tabindex simple.
 */
export function DatePicker({
  value,
  onChange,
  dayCount = DATE_OPTION_COUNT,
  paged = true,
  label = 'Choose a date',
  className,
}: DatePickerProps) {
  const options = useMemo(() => {
    const start = todayIso();
    return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
  }, [dayCount]);

  const activeIndex = Math.max(0, options.indexOf(value));

  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected day in view when it changes from outside (e.g. reschedule).
  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const move = (delta: number) => {
    const currentIndex = options.indexOf(value);
    const base = currentIndex === -1 ? 0 : currentIndex;
    const next = Math.min(options.length - 1, Math.max(0, base + delta));
    if (next !== currentIndex) onChange(options[next]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        onChange(options[0]);
        break;
      case 'End':
        event.preventDefault();
        onChange(options[options.length - 1]);
        break;
      default:
        break;
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700" id="date-picker-label">
          {label}
        </p>
        {paged && (
          <div className="flex gap-1">
            <IconButton
              label="Previous week"
              disabled={activeIndex === 0}
              onClick={() => move(-dayCount)}
            >
              <ChevronIcon direction="left" />
            </IconButton>
            <IconButton
              label="Next week"
              disabled={activeIndex === options.length - 1}
              onClick={() => move(dayCount)}
            >
              <ChevronIcon direction="right" />
            </IconButton>
          </div>
        )}
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-labelledby="date-picker-label"
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto rounded-lg pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {options.map(dateKey => {
          const selected = dateKey === value;
          return (
            <button
              type="button"
              key={dateKey}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => onChange(dateKey)}
              className={cn(
                'flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-center transition',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                selected
                  ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
              )}
            >
              <span
                className={cn(
                  'text-[11px] uppercase tracking-wide',
                  selected ? 'text-white/80' : 'text-gray-500'
                )}
              >
                {formatDayShort(dateKey)}
              </span>
              <span className="text-lg font-bold leading-tight">{dayOfMonth(dateKey)}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Selected: {formatDateLong(value)}
        {isPastDate(value) && <span className="ml-1 text-red-600">(past date)</span>}
      </p>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-300 p-1 text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d={
          direction === 'left'
            ? 'M12.79 5.23a.75.75 0 0 1-.02 1.06L9.06 10l3.71 3.71a.75.75 0 1 1-1.06 1.06l-4.24-4.24a.75.75 0 0 1 0-1.06l4.24-4.24a.75.75 0 0 1 1.06.02z'
            : 'M7.21 14.77a.75.75 0 0 0 .02-1.06L10.94 10 7.23 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 0 1-1.06-.02z'
        }
        clipRule="evenodd"
      />
    </svg>
  );
}
