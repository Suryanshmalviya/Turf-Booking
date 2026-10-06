import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

export interface ContainerProps {
  children: ReactNode;
  size?: 'narrow' | 'default' | 'wide';
  className?: string;
}

const SIZE_CLASS = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const;

/** Centres page content and applies the shared horizontal gutters. */
export function Container({ children, size = 'default', className }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE_CLASS[size], className)}>
      {children}
    </div>
  );
}

export interface PageShellProps {
  children: ReactNode;
  /** Neutral page background used by every authenticated and directory page. */
  tone?: 'plain' | 'muted';
  className?: string;
}

/** Vertical page frame. Pages supply their own content only. */
export function PageShell({ children, tone = 'muted', className }: PageShellProps) {
  return (
    <section
      className={cn('min-h-[70vh] py-10', tone === 'muted' ? 'bg-gray-50' : 'bg-white', className)}
    >
      {children}
    </section>
  );
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  size?: 'default' | 'compact';
  className?: string;
}

/** Consistent page title block: optional eyebrow, title, description, actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = 'default',
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-6', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700">{eyebrow}</p>
        )}
        <h1
          className={cn(
            'mt-2 font-bold text-slate-950',
            size === 'compact' ? 'text-3xl' : 'text-4xl'
          )}
        >
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export interface SectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Titled block used inside a page to separate logical areas. */
export function Section({ title, description, actions, className, children }: SectionProps) {
  return (
    <section className={cn('mt-10', className)}>
      {title && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
            {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
