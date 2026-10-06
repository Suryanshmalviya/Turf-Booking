import type { TableColumn } from '../../types/ui';
import { cn } from '../../utils/cn';

export interface TableProps<TRow> {
  /** Column definitions. `columns[0]` is treated as the primary identity. */
  columns: Array<TableColumn<TRow>>;
  rows: TRow[];
  rowKey: (row: TRow, index: number) => string;
  caption?: string;
  emptyMessage?: string;
  className?: string;
}

/**
 * Generic scrollable table. Presentational only — the caller decides what to
 * render per column so the same table serves the admin console and reporting.
 */
export function Table<TRow>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = 'No records to show.',
  className,
}: TableProps<TRow>) {
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-gray-600">{emptyMessage}</p>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                scope="col"
                className={cn('p-4 font-semibold', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="border-t border-gray-100 hover:bg-gray-50/60">
              {columns.map(column => (
                <td
                  key={column.key}
                  className={cn('p-4 align-middle text-gray-700', column.className)}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
