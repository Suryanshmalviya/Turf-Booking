import { useAvailability } from '../../hooks/useCourts';
import type { AvailabilityInterval, AvailabilityQuery } from '../../types/booking';
import { TimeSlotSelector } from '../booking/TimeSlotSelector';
import { Notice } from '../common/Feedback';
import { ErrorState } from '../ui/ErrorState';
import { Loading } from '../ui/Loading';

export interface CourtAvailabilityProps {
  query: AvailabilityQuery;
  /** False until the customer requests a search, so no request fires on mount. */
  enabled: boolean;
  onSelect: (interval: AvailabilityInterval) => void;
  selectedStartAt?: string;
}

/**
 * Availability for one court on one day. Wraps the query and its pending,
 * empty and failure states so pages only supply the selection behaviour.
 */
export function CourtAvailability({
  query,
  enabled,
  onSelect,
  selectedStartAt,
}: CourtAvailabilityProps) {
  const availability = useAvailability(query, enabled);

  if (enabled && availability.isLoading) {
    return <Loading message="Checking live availability…" />;
  }

  if (enabled && availability.isError) {
    return (
      <ErrorState
        title="Availability unavailable"
        message={availability.error instanceof Error ? availability.error.message : undefined}
        onRetry={() => void availability.refetch()}
      />
    );
  }

  if (enabled && (availability.data?.intervals.length ?? 0) === 0) {
    return (
      <Notice variant="warning" title="No open slots">
        Every court on this date is taken. Try another date or a shorter duration.
      </Notice>
    );
  }

  return (
    <div>
      {enabled && (
        <p className="mb-4 text-sm text-gray-600">
          Availability is confirmed again when a hold is created. A displayed slot is never a
          reservation.
        </p>
      )}
      <TimeSlotSelector
        intervals={availability.data?.intervals ?? []}
        selectedStartAt={selectedStartAt}
        onSelect={onSelect}
        isFetching={availability.isFetching}
      />
    </div>
  );
}