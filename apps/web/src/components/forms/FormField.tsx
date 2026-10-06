import type { ReactNode } from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

import { cn } from '../../utils/cn';

/**
 * Bridges a React Hook Form field to its label and error message. Pair it with
 * the `ui` controls so every field announces its invalid state the same way.
 */
export interface FormFieldProps<TValues extends FieldValues> {
  form: UseFormReturn<TValues>;
  name: FieldPath<TValues>;
  label: string;
  hint?: string;
  hideLabel?: boolean;
  /** Renders the red asterisk and sets the control's required attribute. */
  required?: boolean;
  className?: string;
  children: (field: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
    required: true | undefined;
  }) => ReactNode;
}

export function FormField<TValues extends FieldValues>({
  form,
  name,
  label,
  hint,
  hideLabel,
  required,
  className,
  children,
}: FormFieldProps<TValues>) {
  const id = `field-${name.replace(/\./g, '-')}`;
  const error = form.formState.errors[name];
  const message = typeof error?.message === 'string' ? error.message : undefined;

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={id} className={cn('label', hideLabel && 'sr-only')}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children({
        id,
        required: required || undefined,
        'aria-invalid': message ? true : undefined,
        'aria-describedby': message ? `${id}-error` : hint ? `${id}-hint` : undefined,
      })}
      {message ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {message}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Right-aligned submit row shared by every form. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-3 pt-2', className)}>
      {children}
    </div>
  );
}

/** Form-level error, typically an API rejection that is not field-specific. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </p>
  );
}
