import type { HTMLAttributes, ReactNode } from 'react';

import type { BadgeTone } from '../../types/ui';
import { cn } from '../../utils/cn';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-800',
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

/** Small status pill used for booking states, roles and venue statuses. */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        TONE_CLASS[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface StatusDotProps {
  tone?: BadgeTone;
  label: string;
  className?: string;
}

/** A pill with a leading dot, used for live connection state. */
export function StatusDot({ tone = 'neutral', label, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold',
        TONE_CLASS[tone],
        className
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          tone === 'success' ? 'bg-emerald-500' : tone === 'danger' ? 'bg-red-500' : 'bg-gray-400'
        )}
      />
      {label}
    </span>
  );
}