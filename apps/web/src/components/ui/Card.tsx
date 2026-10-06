import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the default padding so the card can host its own layout. */
  bare?: boolean;
  children: ReactNode;
}

export function Card({ bare, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('card', !bare && 'p-6', className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-5', className)} {...rest}>
      {children}
    </div>
  );
}
