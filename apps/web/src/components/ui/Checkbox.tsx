import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../utils/cn';
import { useFieldId } from './useFieldId';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

/** Checkbox with the label beside the box rather than above it. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, className, id, ...rest },
  ref
) {
  const fieldId = useFieldId(id);

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={fieldId} className="inline-flex cursor-pointer items-center gap-2">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          {...rest}
        />
        <span className="text-sm text-gray-700">{label}</span>
      </label>
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});
