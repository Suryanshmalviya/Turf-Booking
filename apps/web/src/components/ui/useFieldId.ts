import { useId } from 'react';

/** Stable, accessible id for a control that may or may not receive one. */
export function useFieldId(providedId?: string): string {
  const generated = useId();
  return providedId ?? generated;
}
