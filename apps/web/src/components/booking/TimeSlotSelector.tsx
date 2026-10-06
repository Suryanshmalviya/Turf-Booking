import type { AvailabilityInterval } from '../../types/booking';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';

export interface TimeSlotSelectorProps {
  intervals: AvailabilityInterval[];
  selectedStartAt?: string;
  onSelect: (interval: AvailabilityInterval) => void;
  isFetching?: boolean;
  /** Shown instead of the grid before the customer runs a search. */
  idleMessage?: string;
  className?: string;
}

/**
 * Grid of bookable slots returned by the availability endpoint. A slot is only
 * a candidate until a hold is created, so the grid labels it as such.
 */
export function TimeSlotSelector({
  intervals,
  selectedStartAt,
  onSelect,
  isFetching = false,
  idleMessage = 'Choose a court and date, then check live availability.',
  className,
}: TimeSlotSelectorProps) {
  if (intervals.length === 0) {
    return (
      <EmptyState
        title={isFetching ? 'Checking availability' : 'No slots to show'}
        description={isFetching ? 'Asking the server which courts are free.' : idleMessage}
        className={className}
      />
    );
  }

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)} aria-busy={isFetching || undefined}>
      {intervals.map(interval => {
        const isSelected = interval.startAt === selectedStartAt;
        return (
          <button
            type="button"
            key={interval.startAt}
            onClick={() => onSelect(interval)}
            aria-pressed={isSelected}
            className={cn(
              'card p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isSelected ? 'border-primary-500 ring-2 ring-primary-200' : 'hover:border-primary-300'
            )}
          >
            <span className="font-semibold text-slate-950">
              {interval.startLocal}&ndash;{interval.endLocal}
            </span>
            <span className="mt-1 block text-sm text-gray-500">
              {formatMoney(interval.priceMinor, interval.currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
