import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useVenueFilterStore } from '../../store/venueFilter.store';
import { PITCH_FEATURE_OPTIONS } from '../../types/court';
import { type VenueSearchFormValues, venueSearchSchema } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { FormField } from './FormField';

/**
 * Venue discovery filters. Values come from the venue filter store so the
 * selection survives navigating into a venue and back.
 */
export function VenueSearchForm() {
  const filters = useVenueFilterStore(state => state.filters);
  const setFilters = useVenueFilterStore(state => state.setFilters);
  const resetFilters = useVenueFilterStore(state => state.resetFilters);

  const form = useForm<VenueSearchFormValues>({
    resolver: zodResolver(venueSearchSchema),
    defaultValues: filters,
    values: filters,
  });

  const applyFilters = form.handleSubmit(values => setFilters(values));

  return (
    <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" noValidate>
      <FormField form={form} name="q" label="Venue or neighbourhood" hideLabel>
        {field => <Input placeholder="Venue or neighbourhood" {...field} {...form.register('q')} />}
      </FormField>

      <FormField form={form} name="city" label="City" hideLabel>
        {field => <Input placeholder="City" {...field} {...form.register('city')} />}
      </FormField>

      <FormField form={form} name="feature" label="Court type" hideLabel>
        {field => (
          <Select
            placeholder="Any pitch"
            options={PITCH_FEATURE_OPTIONS.map(option => ({
              value: option.value,
              label: option.label,
            }))}
            {...field}
            {...form.register('feature')}
          />
        )}
      </FormField>

      <FormField form={form} name="date" label="Date" hideLabel>
        {field => <Input type="date" {...field} {...form.register('date')} />}
      </FormField>

      <FormField form={form} name="time" label="Preferred time" hideLabel>
        {field => <Input type="time" {...field} {...form.register('time')} />}
      </FormField>

      <FormField form={form} name="maxPrice" label="Maximum price" hideLabel>
        {field => (
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="Max price"
            {...field}
            {...form.register('maxPrice')}
          />
        )}
      </FormField>

      <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit">Search courts</Button>
        <Button type="button" variant="secondary" onClick={() => resetFilters()}>
          Reset
        </Button>
      </div>
    </form>
  );
}
