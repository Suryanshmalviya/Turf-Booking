import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmActionDialog } from '../../components/admin/ConfirmActionDialog';
import { DataTable } from '../../components/admin/DataTable';
import { FilterBar } from '../../components/admin/FilterBar';
import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAdminBookings } from '../../hooks/useAdmin';
import { useCancelBooking } from '../../hooks/useBookings';
import { useToast } from '../../hooks/useToast';
import type { AdminBooking } from '../../types/admin';
import { ADMIN_PAGE_SIZE } from '../../types/admin';
import {
  BOOKING_STATUS_TONE,
  BOOKING_STATUSES,
  bookingStatusLabel,
  PAYMENT_STATUS_TONE,
  paymentStatusLabel,
} from '../../types/booking';
import type { TableColumn } from '../../types/ui';
import { toErrorMessage } from '../../utils/error';
import { formatDateTime, formatMoney } from '../../utils/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  ...BOOKING_STATUSES.map(status => ({ value: status, label: bookingStatusLabel(status) })),
];

/** Statuses the server will refuse to cancel. */
const CANCELABLE = new Set(['held', 'pending', 'confirmed']);

export interface AdminBookingsPageProps {
  /** Lets the dashboard deep-link to a single booking by reference. */
  initialReference?: string;
}

/**
 * Booking administration.
 *
 * Reference, status and date filtering all run server-side, so the table stays
 * responsive on a large dataset. Cancellation is available only for statuses
 * the server will actually accept, and the dialog states the refund consequence
 * before the admin commits.
 */
export function AdminBookingsPage({ initialReference }: AdminBookingsPageProps = {}) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [reference, setReference] = useState(initialReference ?? searchParams.get('reference') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [range, setRange] = useState({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  });
  const [target, setTarget] = useState<AdminBooking>();

  // Keep the URL in step so a filtered view can be shared or bookmarked.
  useEffect(() => {
    const next = new URLSearchParams();
    if (reference) next.set('reference', reference);
    if (status) next.set('status', status);
    if (range.from) next.set('from', range.from);
    if (range.to) next.set('to', range.to);
    setSearchParams(next, { replace: true });
  }, [reference, status, range, setSearchParams]);

  const bookings = useAdminBookings({
    page,
    ...(reference ? { reference } : {}),
    ...(status ? { status } : {}),
    ...(range.from ? { from: new Date(`${range.from}T00:00:00`).toISOString() } : {}),
    ...(range.to ? { to: new Date(`${range.to}T23:59:59`).toISOString() } : {}),
  });

  const cancelBooking = useCancelBooking();

  const reset = () => {
    setPage(1);
    setReference('');
    setStatus('');
    setRange({ from: '', to: '' });
  };

  const confirmCancel = (reason: string) => {
    if (!target?._id) return;

    cancelBooking.mutate(
      { bookingId: target._id, reason },
      {
        onSuccess: ({ booking }) => {
          setTarget(undefined);
          toast.success('Booking cancelled', `${booking.publicReference} is now cancelled.`);
        },
        onError: (cause: unknown) =>
          toast.error('Cancellation failed', toErrorMessage(cause, 'The booking could not be cancelled.')),
      }
    );
  };

  const columns: Array<TableColumn<AdminBooking>> = [
    {
      key: 'reference',
      header: 'Reference',
      render: booking => (
        <span className="font-mono text-xs font-semibold text-slate-950">{booking.publicReference}</span>
      ),
    },
    {
      key: 'start',
      header: 'Starts',
      render: booking => (
        <div>
          <p className="text-sm">{formatDateTime(booking.startAt)}</p>
          <p className="text-xs text-gray-500">ends {formatDateTime(booking.endAt)}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: booking => (
        <span className="font-medium tabular-nums">{formatMoney(booking.amountMinor, booking.currency)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Booking',
      render: booking => <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{bookingStatusLabel(booking.status)}</Badge>,
    },
    {
      key: 'payment',
      header: 'Payment',
      render: booking => (
        <Badge tone={PAYMENT_STATUS_TONE[booking.paymentStatus]}>
          {paymentStatusLabel(booking.paymentStatus)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: booking =>
        CANCELABLE.has(booking.status) && booking._id ? (
          <Button
            size="sm"
            variant="danger"
            disabled={cancelBooking.isPending}
            onClick={() => setTarget(booking)}
          >
            Cancel
          </Button>
        ) : (
          <span className="text-xs text-gray-400">Not cancellable</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption="All platform bookings"
        columns={columns}
        rows={bookings.data?.items ?? []}
        rowKey={booking => booking.publicReference}
        isLoading={bookings.isLoading}
        isError={bookings.isError}
        {...(bookings.isError ? { errorMessage: toErrorMessage(bookings.error) } : {})}
        {...(bookings.isError ? { onRetry: () => void bookings.refetch() } : {})}
        emptyTitle="No bookings match"
        emptyDescription="Adjust the reference, status or date range."
        emptyAction={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
        toolbar={
          <FilterBar
            search={{
              value: reference,
              onChange: value => {
                setReference(value);
                setPage(1);
              },
              placeholder: 'Search reference, e.g. PB-…',
            }}
            filters={[{ name: 'status', label: 'Status', options: STATUS_OPTIONS, hideLabel: true }]}
            values={{ status }}
            onFilterChange={(_name, value) => {
              setStatus(value);
              setPage(1);
            }}
            dateRange={{
              value: range,
              onChange: next => {
                setRange(next);
                setPage(1);
              },
            }}
            onReset={reset}
          />
        }
        pagination={{
          page: bookings.data?.page ?? page,
          limit: bookings.data?.limit ?? ADMIN_PAGE_SIZE,
          total: bookings.data?.total ?? 0,
          onPageChange: setPage,
        }}
        itemLabel="booking"
      />

      <Notice variant="info">
        Cancellation refunds follow the policy snapshot stored on the booking at the time of the hold, so
        late cancellations may refund nothing.
      </Notice>

      <ConfirmActionDialog
        open={Boolean(target)}
        title="Cancel this booking?"
        description={
          target ? (
            <>
              Booking <strong>{target.publicReference}</strong> starting{' '}
              {formatDateTime(target.startAt)} for {formatMoney(target.amountMinor, target.currency)} will be
              cancelled. The slot is released for other customers.
            </>
          ) : undefined
        }
        requireReason
        reasonLabel="Cancellation reason"
        confirmLabel="Cancel booking"
        confirmVariant="danger"
        isPending={cancelBooking.isPending}
        onClose={() => setTarget(undefined)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}