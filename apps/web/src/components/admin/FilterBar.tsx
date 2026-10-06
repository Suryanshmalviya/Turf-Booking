import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select, type SelectOption } from '../ui/Select';

export interface FilterDefinition {
  name: string;
  label: string;
  options: SelectOption[];
  hideLabel?: boolean;
}

export interface DateRangeDefinition {
  from: string;
  to: string;
}

export interface FilterBarProps {
  /** Free-text search. Omit to hide the box. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Dropdown filters. Omit to hide them. */
  filters?: FilterDefinition[];
  /** Current dropdown values, keyed by `FilterDefinition.name`. */
  values?: Record<string, string>;
  onFilterChange?: (name: string, value: string) => void;
  /** Applied date window, when the section supports one. */
  dateRange?: { value: DateRangeDefinition; onChange: (range: DateRangeDefinition) => void };
  onReset?: () => void;
  /** Extra controls (export buttons, legends). */
  children?: ReactNode;
  className?: string;
}

/** Debounce so typing a reference does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Search + filter row shared by every console section.
 *
 * Search is debounced locally while dropdowns apply immediately. Reset clears
 * both, so a filter set never gets stuck in a half-applied state.
 */
export function FilterBar({
  search,
  filters = [],
  values = {},
  onFilterChange,
  dateRange,
  onReset,
  children,
  className,
}: FilterBarProps) {
  const [term, setTerm] = useState(search?.value ?? '');

  // Keep in step when the caller resets or restores filters programmatically.
  useEffect(() => setTerm(search?.value ?? ''), [search?.value]);

  useEffect(() => {
    if (!search) return undefined;
    if (term === search.value) return undefined;

    const timer = window.setTimeout(() => search.onChange(term), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, search]);

  const isDirty =
    Boolean(term) ||
    Object.values(values).some(Boolean) ||
    Boolean(dateRange && (dateRange.value.from || dateRange.value.to));

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {search && (
        <Input
          label="Search"
          hideLabel
          type="search"
          className="w-full sm:w-64"
          placeholder={search.placeholder ?? 'Search…'}
          value={term}
          onChange={event => setTerm(event.target.value)}
        />
      )}

      {filters.map(filter => (
        <Select
          key={filter.name}
          label={filter.label}
          {...(filter.hideLabel === undefined
            ? { hideLabel: true }
            : { hideLabel: filter.hideLabel })}
          className="w-full sm:w-48"
          value={values[filter.name] ?? ''}
          options={filter.options}
          onChange={event => onFilterChange?.(filter.name, event.target.value)}
        />
      ))}

      {dateRange && (
        <>
          <Input
            label="From"
            hideLabel
            type="date"
            className="w-full sm:w-40"
            value={dateRange.value.from}
            max={dateRange.value.to || undefined}
            onChange={event => dateRange.onChange({ ...dateRange.value, from: event.target.value })}
          />
          <Input
            label="To"
            hideLabel
            type="date"
            className="w-full sm:w-40"
            value={dateRange.value.to}
            min={dateRange.value.from || undefined}
            onChange={event => dateRange.onChange({ ...dateRange.value, to: event.target.value })}
          />
        </>
      )}

      {onReset && (
        <Button variant="ghost" onClick={onReset} disabled={!isDirty}>
          Clear filters
        </Button>
      )}

      {children}
    </div>
  );
}
