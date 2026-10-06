import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';
import { Field } from './Field';
import { useFieldId } from './useFieldId';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  invalid?: boolean;
}

/** Multi-line input for descriptions and administrative review reasons. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, hideLabel, invalid, className, id, required, rows = 3, ...rest },
  ref
) {
  const fieldId = useFieldId(id);
  const hasError = Boolean(error ?? invalid);

  const control = (
    <textarea
      ref={ref}
      id={fieldId}
      rows={rows}
      required={required}
      aria-invalid={hasError || undefined}
      aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
      className={cn('input resize-y', hasError && 'border-red-400', className)}
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
