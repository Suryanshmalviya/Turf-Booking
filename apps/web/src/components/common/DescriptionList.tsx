import type { ReactNode } from 'react';

export interface DescriptionListProps {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}

/**
 * Key/value list used for booking summaries and detail views. Rendered from an
 * array so every page formats its rows identically.
 */
export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={`divide-y divide-gray-100 ${className ?? ''}`.trim()}>
      {items.map(item => (
        <div key={item.label} className="flex items-start justify-between gap-5 py-4">
          <dt className="text-gray-500">{item.label}</dt>
          <dd className="text-right font-medium text-slate-950">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
