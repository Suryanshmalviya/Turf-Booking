import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';
import { Field } from './Field';
import { useFieldId } from './useFieldId';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  /** Adds the red error border when the control is in an invalid state. */
  invalid?: boolean;
}

/** Text-like input. Pass `label` to render the field scaffolding inline. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, invalid, className, id, required, ...rest },
  ref
) {
  const fieldId = useFieldId(id);
  const hasError = Boolean(error ?? invalid);

  const control = (
    <input
      ref={ref}
      id={fieldId}
      required={required}
      aria-invalid={hasError || undefined}
      aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
      className={cn('input', hasError && 'border-red-400 focus-visible:ring-red-400', className)}
      {...rest}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
    >
      {control}
    </Field>
  );
});
