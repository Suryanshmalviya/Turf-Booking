import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';
import { Field } from './Field';
import { useFieldId } from './useFieldId';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  invalid?: boolean;
  /** Placeholder entry rendered first when the value is empty. */
  placeholder?: string;
  options: SelectOption[];
}

/** Native select built from a fixed option list, used for every filter form. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, hideLabel, invalid, placeholder, options, className, id, required, ...rest },
  ref
) {
  const fieldId = useFieldId(id);
  const hasError = Boolean(error ?? invalid);

  const control = (
    <select
      ref={ref}
      id={fieldId}
      required={required}
      aria-invalid={hasError || undefined}
      aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
      className={cn('input', hasError && 'border-red-400', className)}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(option => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field id={fieldId} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel}>
      {control}
    </Field>
  );
});