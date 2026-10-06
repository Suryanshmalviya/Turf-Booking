import { type FormEvent,useState } from 'react';

import type { Pitch } from '../../types/court';
import { BOOKING_DURATION_OPTIONS } from '../../types/court';
import { toErrorMessage } from '../../utils/error';
import type { BookingRequestFormValues } from '../../utils/validation';
import { bookingRequestSchema } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export interface BookingFormProps {
  pitches: Pitch[];
  values: BookingRequestFormValues;
  onChange: (values: BookingRequestFormValues) => void;
  onSearch: (values: BookingRequestFormValues) => void;
  isSearching?: boolean;
  /** Today, used as the earliest selectable booking date. */
  minDate: string;
}

/**
 * Court, date and duration picker for the availability search. The parent owns
 * the values so the same selection survives a navigation to checkout.
 */
export function BookingForm({
  pitches,
  values,
  onChange,
  onSearch,
  isSearching = false,
  minDate,
}: BookingFormProps) {
  const [validationError, setValidationError] = useState<string>();
  const patch = (next: Partial<BookingRequestFormValues>) => onChange({ ...values, ...next });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = bookingRequestSchema.safeParse(values);
    if (!parsed.success) {
      setValidationError(toErrorMessage(parsed.error, 'Choose a court and a date.'));
      return;
    }
    setValidationError(undefined);
    onSearch(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label className="label" htmlFor="booking-pitch">
          Court
        </label>
        <Select
          id="booking-pitch"
          options={pitches.map(pitch => ({
            value: pitch._id,
            label: `${pitch.name} · ${pitch.indoor ? 'Indoor' : 'Outdoor'}`,
          }))}
          value={values.pitchId}
          onChange={event => patch({ pitchId: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="booking-date">
          Date
        </label>
        <Input
          id="booking-date"
          type="date"
          min={minDate}
          value={values.date}
          onChange={event => patch({ date: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="booking-duration">
          Duration
        </label>
        <Select
          id="booking-duration"
          options={BOOKING_DURATION_OPTIONS.map(minutes => ({
            value: String(minutes),
            label: `${minutes} minutes`,
          }))}
          value={String(values.durationMinutes)}
          onChange={event => patch({ durationMinutes: Number(event.target.value) })}
        />
      </div>

      {validationError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {validationError}
        </p>
      )}

      <Button type="submit" block loading={isSearching} disabled={!values.pitchId}>
        {isSearching ? 'Checking live availability' : 'Check live availability'}
      </Button>
    </form>
  );
}