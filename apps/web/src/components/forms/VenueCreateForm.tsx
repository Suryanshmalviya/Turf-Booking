import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateVenue } from '../../hooks/useAdmin';
import { toErrorMessage } from '../../utils/error';
import { type AdminVenueFormValues,adminVenueSchema } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Input } from '../ui/Input';
import { FormActions, FormError, FormField } from './FormField';

const DEFAULTS: AdminVenueFormValues = {
  name: '',
  city: '',
  line1: '',
  description: '',
  courtName: 'Court 1',
  courtSurface: 'Pro Cushion Acrylic',
  pricePerHour: 500,
  indoor: false,
};

export interface VenueCreateFormProps {
  onCreated?: (venueName: string) => void;
}

/** Stores a new venue together with its first court and hourly price. */
export function VenueCreateForm({ onCreated }: VenueCreateFormProps) {
  const createVenue = useCreateVenue();
  const [submitError, setSubmitError] = useState<string>();

  const form = useForm<AdminVenueFormValues>({
    resolver: zodResolver(adminVenueSchema),
    defaultValues: DEFAULTS,
  });

  const onSubmit = form.handleSubmit(async values => {
    setSubmitError(undefined);
    try {
      await createVenue.mutateAsync(values);
      form.reset(DEFAULTS);
      onCreated?.(values.name);
    } catch (error: unknown) {
      setSubmitError(toErrorMessage(error, 'Unable to store the venue.'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={submitError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField form={form} name="name" label="Venue name" required>
          {field => (
            <Input placeholder="e.g. Metro Pickleball Hub" {...field} {...form.register('name')} />
          )}
        </FormField>

        <FormField form={form} name="city" label="City" required>
          {field => <Input placeholder="e.g. Pune" {...field} {...form.register('city')} />}
        </FormField>

        <FormField form={form} name="line1" label="Address line">
          {field => <Input placeholder="42 Sports Court Blvd" {...field} {...form.register('line1')} />}
        </FormField>

        <FormField form={form} name="description" label="Description">
          {field => (
            <Input placeholder="Tournament grade courts with LED lights" {...field} {...form.register('description')} />
          )}
        </FormField>
      </div>

      <fieldset className="space-y-4 border-t border-gray-100 pt-4">
        <legend className="text-sm font-semibold text-slate-950">Court details</legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField form={form} name="courtName" label="Court name" required>
            {field => <Input placeholder="Court 1" {...field} {...form.register('courtName')} />}
          </FormField>

          <FormField form={form} name="courtSurface" label="Surface" required>
            {field => <Input placeholder="Acrylic" {...field} {...form.register('courtSurface')} />}
          </FormField>

          <FormField form={form} name="pricePerHour" label="Price per hour" required>
            {field => (
              <Input type="number" min="0" step="any" {...field} {...form.register('pricePerHour')} />
            )}
          </FormField>
        </div>

        <Checkbox
          label="Indoor court (air conditioned or covered)"
          checked={form.watch('indoor')}
          onChange={event => form.setValue('indoor', event.target.checked)}
        />
      </fieldset>

      <FormActions>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Store court
        </Button>
      </FormActions>
    </form>
  );
}