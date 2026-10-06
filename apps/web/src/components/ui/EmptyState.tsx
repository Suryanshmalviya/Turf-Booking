import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Call to action rendered below the copy, e.g. a "Browse venues" link. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Shown when a query succeeded but returned nothing to render. */
export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={`card p-10 text-center ${className ?? ''}`.trim()}>
      {icon && <div className="mb-3 flex justify-center text-3xl text-gray-300">{icon}</div>}
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      {description && <p className="mt-2 text-gray-600">{description}</p>}
      {action && <div className="mt-6 flex justify-center gap-3">{action}</div>}
    </div>
  );
}