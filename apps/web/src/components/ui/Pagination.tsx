import { cn } from '../../utils/cn';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Noun used in the summary line, e.g. "record" or "venue". */
  itemLabel?: string;
  className?: string;
}

/**
 * Page selector for the list endpoints. Renders only when more than one page
 * exists so simple lists stay uncluttered.
 */
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  itemLabel = 'record',
  className,
}: PaginationProps) {
  const safeLimit = limit > 0 ? limit : 1;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const first = total === 0 ? 0 : (page - 1) * safeLimit + 1;
  const last = Math.min(page * safeLimit, total);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <p className="text-sm text-gray-600" aria-live="polite">
        {total === 0
          ? `0 ${itemLabel}s`
          : `${first}–${last} of ${total} ${total === 1 ? itemLabel : `${itemLabel}s`}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="px-2 text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}