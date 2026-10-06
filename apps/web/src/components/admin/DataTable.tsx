import type { ReactNode } from 'react';

import type { TableColumn } from '../../types/ui';
import { cn } from '../../utils/cn';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Skeleton } from '../ui/Loading';
import { Pagination } from '../ui/Pagination';

export interface DataTableProps<TRow> {
  columns: Array<TableColumn<TRow>>;
  rows: TRow[];
  rowKey: (row: TRow, index: number) => string;
  /** Accessible name for the table, used as its visually hidden caption. */
  caption: string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Omit to render the table without a pager. */
  pagination?: { page: number; limit: number; total: number; onPageChange: (page: number) => void };
  itemLabel?: string;
  /** Renders above the table, typically the filter bar. */
  toolbar?: ReactNode;
  /** Renders in the card header, typically a primary action button. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The console's single list primitive.
 *
 * Every section composes the same four states — loading, error, empty and rows —
 * plus pagination, so a new admin table gets consistent behaviour and
 * accessibility for free instead of re-implementing them.
 */
export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  caption,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Records will appear once they exist.',
  emptyAction,
  pagination,
  itemLabel = 'record',
  toolbar,
  actions,
  className,
}: DataTableProps<TRow>) {
  const hasRows = rows.length > 0;

  return (
    <Card bare className={className}>
      {(toolbar || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 p-5">
          {toolbar ?? <span />}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-6">
          <ErrorState
            {...(errorMessage ? { message: errorMessage } : {})}
            {...(onRetry ? { onRetry } : {})}
          />
        </div>
      ) : !hasRows ? (
        <div className="p-6">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            {...(emptyAction ? { action: emptyAction } : {})}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {columns.map(column => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn('px-5 py-3 font-semibold', column.className)}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  className="border-t border-gray-100 align-middle hover:bg-gray-50/60"
                >
                  {columns.map(column => (
                    <td
                      key={column.key}
                      className={cn('px-5 py-3 text-gray-700', column.className)}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && !isLoading && !isError && hasRows && (
        <div className="border-t border-gray-100 p-4">
          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            itemLabel={itemLabel}
          />
        </div>
      )}
    </Card>
  );
}
