import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../utils/cn';

export interface BackLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

/** "← Back to …" link that keeps pages consistent without repeating markup. */
export function BackLink({ to, children, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline', className)}
    >
      <span aria-hidden="true">&larr;</span>
      {children}
    </Link>
  );
}

export interface NoticeProps {
  variant?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
  className?: string;
}

const NOTICE_CLASS = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
} as const;

/** Highlighted callout for policy text, warnings and status explanations. */
export function Notice({ variant = 'info', title, children, className }: NoticeProps) {
  return (
    <div className={cn('rounded-lg border p-4 text-sm', NOTICE_CLASS[variant], className)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-1')}>{children}</div>
    </div>
  );
}