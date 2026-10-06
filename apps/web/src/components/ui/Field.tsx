import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

export interface FieldProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Visually hide the label while keeping it available to screen readers. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error scaffolding shared by every form control so
 * spacing and accessibility attributes stay consistent.
 */
export function Field({ id, label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className={cn('label', hideLabel && 'sr-only')}>
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {describedBy && (
        <p
          id={describedBy}
          className={cn('mt-1 text-xs', error ? 'text-red-600' : 'text-gray-500')}
          role={error ? 'alert' : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}