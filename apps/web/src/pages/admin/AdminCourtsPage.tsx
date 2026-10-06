import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ConfirmActionDialog } from '../../components/admin/ConfirmActionDialog';
import { DataTable } from '../../components/admin/DataTable';
import { FilterBar } from '../../components/admin/FilterBar';
import { Notice } from '../../components/common/Feedback';
import { VenueCreateForm } from '../../components/forms/VenueCreateForm';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { useAdminVenues, useReviewVenue } from '../../hooks/useAdmin';
import { useVenueSchedule } from '../../hooks/useCourts';
import { useToast } from '../../hooks/useToast';
import { courtApi } from '../../services/court.api';
import type { AdminVenue, VenueAction } from '../../types/admin';
import {
  ADMIN_PAGE_SIZE,
  humanize,
  VENUE_ACTIONS,
  VENUE_STATUS_TONE,
  VENUE_STATUSES,
} from '../../types/admin';
import { WEEKDAY_LABELS } from '../../types/court';
import type { TableColumn } from '../../types/ui';
import { toErrorMessage } from '../../utils/error';
import {
  formatDateTime,
  formatMinute,
  formatMoney,
  majorToMinor,
  todayIso,
} from '../../utils/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  ...VENUE_STATUSES.map(status => ({ value: status, label: humanize(status) })),
];

const ACTION_COPY: Record<
  VenueAction,
  { title: string; confirm: string; variant: 'primary' | 'danger' | 'secondary' }
> = {
  active: { title: 'Publish this court?', confirm: 'Publish', variant: 'primary' },
  rejected: { title: 'Reject this court?', confirm: 'Reject', variant: 'danger' },
  suspended: { title: 'Suspend this court?', confirm: 'Suspend', variant: 'secondary' },
};

const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AED'].map(code => ({
  value: code,
  label: code,
}));

const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, index) => ({ value: String(index), label }));

const scheduleSchema = z
  .object({
    dayOfWeek: z.string(),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  })
  .refine(value => value.end > value.start, {
    message: 'Closing time must be after opening time',
    path: ['end'],
  });

const priceSchema = z.object({
  amount: z.string().refine(value => majorToMinor(value) !== undefined, 'Enter a valid amount'),
  currency: z.string().length(3, 'Use a 3-letter code'),
  dayOfWeek: z.string(),
  pricingUnit: z.enum(['booking', 'hour']),
  priority: z.coerce.number().int().min(0).max(999),
});

const blackoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  reason: z
    .string()
    .trim()
    .min(3, 'Give a short reason')
    .max(500, 'Reason must be 500 characters or fewer'),
});

type Panel = 'schedule' | 'pricing' | 'create' | null;

function toMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Court administration.
 *
 * The console lists venues rather than individual courts because the admin
 * endpoints are venue-scoped: opening hours and price rules are configured per
 * venue, and `active`/`rejected`/`suspended` applies to the venue as a whole.
 * Suspending is the closest equivalent to "deactivate" here — it stops new
 * bookings without deleting the venue or its existing bookings.
 */
export function AdminCourtsPage() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<AdminVenue | null>(null);
  const [moderation, setModeration] = useState<{ venue: AdminVenue; action: VenueAction }>();

  const query = { page, ...(search ? { q: search } : {}), ...(status ? { status } : {}) };
  const venues = useAdminVenues(query);
  const reviewVenue = useReviewVenue();

  const reset = () => {
    setPage(1);
    setSearch('');
    setStatus('');
  };

  const openPanel = (venue: AdminVenue, next: Exclude<Panel, null>) => {
    setSelected(venue);
    setPanel(next);
  };

  const applyModeration = (reason: string) => {
    if (!moderation) return;
    const { venue, action } = moderation;

    reviewVenue.mutate(
      { venueId: venue._id ?? '', action, reason },
      {
        onSuccess: () => {
          setModeration(undefined);
          toast.success('Court updated', `${venue.name} is now ${humanize(action)}.`);
        },
        onError: (cause: unknown) =>
          toast.error('Update failed', toErrorMessage(cause, 'The court could not be updated.')),
      }
    );
  };

  const columns: Array<TableColumn<AdminVenue>> = [
    {
      key: 'name',
      header: 'Court',
      render: venue => (
        <div>
          <p className="font-semibold text-slate-950">{venue.name}</p>
          <p className="text-xs text-gray-500">{venue.address?.city ?? 'No city'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: venue => (
        <Badge tone={VENUE_STATUS_TONE[venue.status]}>{humanize(venue.status)}</Badge>
      ),
    },
    {
      key: 'timezone',
      header: 'Timezone',
      render: venue => <span className="text-xs text-gray-500">{venue.timezone ?? '—'}</span>,
    },
    {
      key: 'reviewed',
      header: 'Last reviewed',
      render: venue => (
        <span className="text-xs text-gray-500">{formatDateTime(venue.reviewedAt ?? '')}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: venue => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => openPanel(venue, 'schedule')}>
            Hours
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openPanel(venue, 'pricing')}>
            Pricing
          </Button>
          <Select
            label={`Moderate ${venue.name}`}
            hideLabel
            className="w-36"
            value=""
            placeholder="Moderate…"
            disabled={reviewVenue.isPending}
            options={VENUE_ACTIONS.map(action => ({ value: action, label: humanize(action) }))}
            onChange={event => setModeration({ venue, action: event.target.value as VenueAction })}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption="Court venues and their moderation state"
        columns={columns}
        rows={venues.data?.items ?? []}
        rowKey={(venue, index) => venue._id ?? `${venue.name}-${index}`}
        isLoading={venues.isLoading}
        isError={venues.isError}
        {...(venues.isError ? { errorMessage: toErrorMessage(venues.error) } : {})}
        {...(venues.isError ? { onRetry: () => void venues.refetch() } : {})}
        emptyTitle="No courts match"
        emptyDescription="Try a different search term or clear the filters."
        emptyAction={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
        toolbar={
          <FilterBar
            search={{
              value: search,
              onChange: value => {
                setSearch(value);
                setPage(1);
              },
              placeholder: 'Search court name…',
            }}
            filters={[
              { name: 'status', label: 'Status', options: STATUS_OPTIONS, hideLabel: true },
            ]}
            values={{ status }}
            onFilterChange={(_name, value) => {
              setStatus(value);
              setPage(1);
            }}
            onReset={reset}
          />
        }
        actions={<Button onClick={() => setPanel('create')}>Add a court</Button>}
        pagination={{
          page: venues.data?.page ?? page,
          limit: venues.data?.limit ?? ADMIN_PAGE_SIZE,
          total: venues.data?.total ?? 0,
          onPageChange: setPage,
        }}
        itemLabel="court"
      />

      <Notice variant="info">
        Suspending a court stops new bookings immediately without touching the venue or its existing
        bookings. Use it in place of deleting one.
      </Notice>

      <Modal
        open={panel === 'create'}
        onClose={() => setPanel(null)}
        title="Add a court"
        description="Creates the venue together with its first court, opening hours and hourly price, so it is immediately bookable."
        size="lg"
      >
        <VenueCreateForm
          onCreated={name => {
            setPanel(null);
            toast.success('Court created', `${name} is now bookable.`);
          }}
        />
      </Modal>

      {panel === 'schedule' && selected && (
        <SchedulePanel venue={selected} onClose={() => setPanel(null)} />
      )}

      {panel === 'pricing' && selected && (
        <PricingPanel venue={selected} onClose={() => setPanel(null)} />
      )}

      <ConfirmActionDialog
        open={Boolean(moderation)}
        title={moderation ? ACTION_COPY[moderation.action].title : ''}
        description={
          moderation ? (
            <>
              {moderation.venue.name} will become <strong>{humanize(moderation.action)}</strong>.
              Suspending stops new bookings without deleting existing ones.
            </>
          ) : undefined
        }
        requireReason
        confirmLabel={moderation ? ACTION_COPY[moderation.action].confirm : 'Confirm'}
        confirmVariant={moderation ? ACTION_COPY[moderation.action].variant : 'primary'}
        isPending={reviewVenue.isPending}
        onClose={() => setModeration(undefined)}
        onConfirm={applyModeration}
      />
    </div>
  );
}

interface PanelProps {
  venue: AdminVenue;
  onClose: () => void;
}

/** Read-only weekly hours plus a form to add another window. */
function SchedulePanel({ venue, onClose }: PanelProps) {
  const toast = useToast();
  const schedule = useVenueSchedule(venue._id);
  const [error, setError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { dayOfWeek: '1', start: '06:00', end: '22:00' },
  });

  const addRule = handleSubmit(async values => {
    setError(undefined);
    try {
      await courtApi.createAvailabilityRule(venue._id ?? '', {
        dayOfWeek: Number(values.dayOfWeek),
        startMinute: toMinute(values.start),
        endMinute: toMinute(values.end),
      });
      toast.success(
        'Hours added',
        `${WEEKDAY_LABELS[Number(values.dayOfWeek)]} ${values.start}–${values.end}.`
      );
      reset();
      void schedule.refetch();
    } catch (cause) {
      setError(toErrorMessage(cause, 'The opening hours could not be saved.'));
    }
  });

  const rules = schedule.data?.rules ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Opening hours — ${venue.name}`}
      description="Weekly windows, in the venue's own timezone."
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {schedule.isLoading ? (
        <p className="text-sm text-gray-600">Loading hours…</p>
      ) : schedule.isError ? (
        <Notice variant="danger">
          {toErrorMessage(schedule.error, 'Hours could not be loaded.')}
        </Notice>
      ) : rules.length === 0 ? (
        <Notice variant="warning" title="No opening hours">
          This court has no windows, so its availability will come back empty and nothing can be
          booked.
        </Notice>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Configured opening hours by weekday</caption>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Day
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Opens
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Closes
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule._id} className="border-t border-gray-100">
                <td className="px-4 py-2">{WEEKDAY_LABELS[rule.dayOfWeek]}</td>
                <td className="px-4 py-2 tabular-nums">{formatMinute(rule.startMinute)}</td>
                <td className="px-4 py-2 tabular-nums">{formatMinute(rule.endMinute)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={addRule} className="mt-6 space-y-4 border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-slate-950">Add a window</h3>

        <Select
          label="Day"
          {...register('dayOfWeek')}
          error={errors.dayOfWeek?.message}
          options={WEEKDAY_OPTIONS}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Opens" type="time" {...register('start')} error={errors.start?.message} />
          <Input label="Closes" type="time" {...register('end')} error={errors.end?.message} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" loading={isSubmitting}>
          Save window
        </Button>
      </form>
    </Modal>
  );
}

/** Read-only price rules, a form to add one, and a same-day blackout form. */
function PricingPanel({ venue, onClose }: PanelProps) {
  const toast = useToast();
  const schedule = useVenueSchedule(venue._id);
  const [priceError, setPriceError] = useState<string>();
  const [blackoutError, setBlackoutError] = useState<string>();

  const {
    register: registerPrice,
    handleSubmit: submitPrice,
    reset: resetPrice,
    formState: { errors: priceErrors, isSubmitting: isSavingPrice },
  } = useForm<z.infer<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: { amount: '', currency: 'INR', dayOfWeek: '', pricingUnit: 'hour', priority: 0 },
  });

  const addRule = submitPrice(async values => {
    setPriceError(undefined);
    const amountMinor = majorToMinor(values.amount);
    if (amountMinor === undefined) {
      setPriceError('Enter a valid amount.');
      return;
    }

    try {
      await courtApi.createPriceRule(venue._id ?? '', {
        amountMinor,
        currency: values.currency.toUpperCase(),
        pricingUnit: values.pricingUnit,
        priority: values.priority,
        ...(values.dayOfWeek ? { dayOfWeek: Number(values.dayOfWeek) } : {}),
      });
      toast.success('Price rule added', `${values.currency} ${values.amount}.`);
      resetPrice();
      void schedule.refetch();
    } catch (cause) {
      setPriceError(toErrorMessage(cause, 'The price rule could not be saved.'));
    }
  });

  const {
    register: registerBlackout,
    handleSubmit: submitBlackout,
    reset: resetBlackout,
    formState: { errors: blackoutErrors, isSubmitting: isSavingBlackout },
  } = useForm<z.infer<typeof blackoutSchema>>({
    resolver: zodResolver(blackoutSchema),
    defaultValues: { date: todayIso(), reason: '' },
  });

  const addBlackout = submitBlackout(async values => {
    setBlackoutError(undefined);
    try {
      await courtApi.addBlackout(venue._id ?? '', { date: values.date, reason: values.reason });
      toast.success('Court closed', `Unavailable on ${values.date}.`);
      resetBlackout();
      void schedule.refetch();
    } catch (cause) {
      setBlackoutError(toErrorMessage(cause, 'The closure could not be saved.'));
    }
  });

  const prices = schedule.data?.prices ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pricing — ${venue.name}`}
      description="When several rules match a slot, the highest priority wins."
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {schedule.isLoading ? (
        <p className="text-sm text-gray-600">Loading price rules…</p>
      ) : schedule.isError ? (
        <Notice variant="danger">
          {toErrorMessage(schedule.error, 'Pricing could not be loaded.')}
        </Notice>
      ) : prices.length === 0 ? (
        <Notice variant="warning" title="No price rules">
          Without a price rule this court cannot be priced, so nothing will be bookable.
        </Notice>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Configured price rules</caption>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Amount
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Unit
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Applies
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Priority
              </th>
            </tr>
          </thead>
          <tbody>
            {prices.map(rule => (
              <tr key={rule._id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">
                  {formatMoney(rule.amountMinor, rule.currency)}
                </td>
                <td className="px-4 py-2">
                  {rule.pricingUnit === 'hour' ? 'Per hour' : 'Per booking'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {rule.dayOfWeek === undefined
                    ? 'Every day'
                    : (WEEKDAY_LABELS[rule.dayOfWeek] ?? `Day ${rule.dayOfWeek}`)}
                </td>
                <td className="px-4 py-2 tabular-nums">{rule.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={addRule} className="mt-6 space-y-4 border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-slate-950">Add a price rule</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="600"
            {...registerPrice('amount')}
            error={priceErrors.amount?.message}
            hint="In major units — 600 means 600."
          />
          <Select
            label="Currency"
            {...registerPrice('currency')}
            error={priceErrors.currency?.message}
            options={CURRENCY_OPTIONS}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Applies on"
            {...registerPrice('dayOfWeek')}
            options={[{ value: '', label: 'Every day' }, ...WEEKDAY_OPTIONS]}
          />
          <Select
            label="Unit"
            {...registerPrice('pricingUnit')}
            options={[
              { value: 'hour', label: 'Per hour' },
              { value: 'booking', label: 'Per booking' },
            ]}
          />
          <Input
            label="Priority"
            type="number"
            min="0"
            {...registerPrice('priority')}
            error={priceErrors.priority?.message}
            hint="Higher wins."
          />
        </div>

        {priceError && (
          <p role="alert" className="text-sm text-red-700">
            {priceError}
          </p>
        )}

        <Button type="submit" loading={isSavingPrice}>
          Save rule
        </Button>
      </form>

      <form onSubmit={addBlackout} className="mt-6 space-y-4 border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-slate-950">Close this court for a date</h3>
        <p className="text-sm text-gray-600">
          Blackouts remove the court from availability for the day.
        </p>

        <Input
          label="Date"
          type="date"
          {...registerBlackout('date')}
          error={blackoutErrors.date?.message}
        />

        <Textarea
          label="Reason"
          rows={2}
          placeholder="Surface resurfacing"
          {...registerBlackout('reason')}
          error={blackoutErrors.reason?.message}
        />

        {blackoutError && (
          <p role="alert" className="text-sm text-red-700">
            {blackoutError}
          </p>
        )}

        <Button type="submit" variant="secondary" loading={isSavingBlackout}>
          Close this date
        </Button>
      </form>
    </Modal>
  );
}
