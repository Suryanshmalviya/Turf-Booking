import { useState } from 'react';

import { DataTable } from '../../components/admin/DataTable';
import { FilterBar } from '../../components/admin/FilterBar';
import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Loading';
import { Modal } from '../../components/ui/Modal';
import { useAdminBookings, useBookingPayments } from '../../hooks/useAdmin';
import type { AdminBooking } from '../../types/admin';
import { ADMIN_PAGE_SIZE } from '../../types/admin';
import type { PaymentStatus } from '../../types/booking';
import {
  BOOKING_STATUS_TONE,
  BOOKING_STATUSES,
  bookingStatusLabel,
  PAYMENT_STATUS_TONE,
  PAYMENT_STATUSES,
  paymentStatusLabel,
} from '../../types/booking';
import type { TableColumn } from '../../types/ui';
import { toErrorMessage } from '../../utils/error';
import { formatDateTime, formatMoney } from '../../utils/format';

const BOOKING_STATUS_OPTIONS = [
  { value: '', label: 'Any booking status' },
  ...BOOKING_STATUSES.map(status => ({ value: status, label: bookingStatusLabel(status) })),
];

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Any payment status' },
  ...PAYMENT_STATUSES.map(status => ({ value: status, label: paymentStatusLabel(status) })),
];

/**
 * Payment administration.
 *
 * The API exposes payment detail per booking rather than as a standalone list, so
 * this section is a booking list; opening a row loads that booking's attempts,
 * refunds and audit trail. Refunds are request-only — the server initiates them,
 * so this view reports rather than triggers them.
 *
 * The payment-status filter narrows the current page only: `/admin/bookings`
 * filters on booking status and has no payment-status parameter, so filtering the
 * whole dataset by payment status is not something the API can do. The label says
 * so, and a server-side narrowing can replace it if the endpoint grows one.
 */
export function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>('');
  const [selected, setSelected] = useState<AdminBooking>();

  const bookings = useAdminBookings({
    page,
    ...(search ? { reference: search } : {}),
    ...(bookingStatus ? { status: bookingStatus } : {}),
  });

  const rows = (bookings.data?.items ?? []).filter(booking =>
    paymentStatus ? booking.paymentStatus === paymentStatus : true
  );

  const reset = () => {
    setPage(1);
    setSearch('');
    setBookingStatus('');
    setPaymentStatus('');
  };

  const columns: Array<TableColumn<AdminBooking>> = [
    {
      key: 'reference',
      header: 'Reference',
      render: booking => (
        <span className="font-mono text-xs font-semibold text-slate-950">
          {booking.publicReference}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: booking => (
        <span className="font-medium tabular-nums">
          {formatMoney(booking.amountMinor, booking.currency)}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Payment status',
      render: booking => (
        <Badge tone={PAYMENT_STATUS_TONE[booking.paymentStatus]}>
          {paymentStatusLabel(booking.paymentStatus)}
        </Badge>
      ),
    },
    {
      key: 'booking',
      header: 'Booking status',
      render: booking => (
        <Badge tone={BOOKING_STATUS_TONE[booking.status]}>
          {bookingStatusLabel(booking.status)}
        </Badge>
      ),
    },
    {
      key: 'starts',
      header: 'Starts',
      render: booking => (
        <span className="text-xs text-gray-500">{formatDateTime(booking.startAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: booking => (
        <Button size="sm" variant="secondary" onClick={() => setSelected(booking)}>
          Payment detail
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption="Payments by booking"
        columns={columns}
        rows={rows}
        rowKey={booking => booking.publicReference}
        isLoading={bookings.isLoading}
        isError={bookings.isError}
        {...(bookings.isError ? { errorMessage: toErrorMessage(bookings.error) } : {})}
        {...(bookings.isError ? { onRetry: () => void bookings.refetch() } : {})}
        emptyTitle="No payments match"
        emptyDescription="Adjust the reference or status filters."
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
              placeholder: 'Search reference…',
            }}
            filters={[
              {
                name: 'bookingStatus',
                label: 'Booking status',
                options: BOOKING_STATUS_OPTIONS,
                hideLabel: true,
              },
              {
                name: 'paymentStatus',
                label: 'Payment status on this page',
                options: PAYMENT_STATUS_OPTIONS,
                hideLabel: true,
              },
            ]}
            values={{ bookingStatus, paymentStatus }}
            onFilterChange={(name, value) => {
              if (name === 'bookingStatus') setBookingStatus(value);
              if (name === 'paymentStatus') setPaymentStatus(value as PaymentStatus | '');
              setPage(1);
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
        itemLabel="payment"
      />

      <Notice variant="info">
        Refunds are raised by the server when a booking is cancelled inside its refund policy, or
        manually by a venue owner or administrator. This view reports the outcome rather than
        issuing refunds.
      </Notice>

      {selected && <PaymentDetailModal booking={selected} onClose={() => setSelected(undefined)} />}
    </div>
  );
}

interface PaymentDetailModalProps {
  booking: AdminBooking;
  onClose: () => void;
}

function PaymentDetailModal({ booking, onClose }: PaymentDetailModalProps) {
  const payments = useBookingPayments(booking._id);

  const attempts = payments.data?.payments ?? [];
  const refunds = payments.data?.refunds ?? [];
  const audit = payments.data?.audit ?? [];
  const refundedMinor = refunds
    .filter(refund => refund.status === 'succeeded')
    .reduce((sum, refund) => sum + refund.amountMinor, 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Payment detail — ${booking.publicReference}`}
      description={`${formatMoney(booking.amountMinor, booking.currency)} · ${paymentStatusLabel(
        booking.paymentStatus
      )}`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {payments.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : payments.isError ? (
        <Notice variant="danger">
          {toErrorMessage(payments.error, 'Payment detail could not be loaded.')}
        </Notice>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="font-semibold text-slate-950">Attempts</h3>
            {attempts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No payment attempt was ever started.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {attempts.map(attempt => (
                  <li
                    key={attempt._id ?? attempt.providerPaymentId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {formatMoney(attempt.amountMinor, attempt.currency)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {attempt.provider ?? 'unknown provider'}
                        {attempt.providerPaymentId ? ` · ${attempt.providerPaymentId}` : ''}
                      </p>
                      {attempt.failureCode && (
                        <p className="text-xs text-red-700">Failure: {attempt.failureCode}</p>
                      )}
                      {attempt.uncertainReason && (
                        <p className="text-xs text-amber-700">{attempt.uncertainReason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge tone={PAYMENT_STATUS_TONE[attempt.status]}>
                        {paymentStatusLabel(attempt.status)}
                      </Badge>
                      <p className="mt-1 text-xs text-gray-400">
                        {formatDateTime(attempt.createdAt ?? '')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-semibold text-slate-950">Refunds</h3>
            <p className="mt-1 text-sm text-gray-600">
              {refundedMinor > 0
                ? `${formatMoney(refundedMinor, booking.currency)} refunded successfully.`
                : 'No successful refunds against this booking.'}
            </p>
            {refunds.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No refund has been requested.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {refunds.map(refund => (
                  <li
                    key={refund._id ?? refund.providerRefundId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {formatMoney(refund.amountMinor, refund.currency)}
                      </p>
                      {refund.reason && <p className="text-xs text-gray-500">{refund.reason}</p>}
                      {refund.failureReason && (
                        <p className="text-xs text-red-700">{refund.failureReason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge
                        tone={
                          refund.status === 'succeeded'
                            ? 'success'
                            : refund.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {refund.status}
                      </Badge>
                      <p className="mt-1 text-xs text-gray-400">
                        {formatDateTime(refund.createdAt ?? '')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-semibold text-slate-950">Audit trail</h3>
            {audit.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No audited actions on this booking.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {audit.map(entry => (
                  <li
                    key={entry._id ?? `${entry.action}-${entry.createdAt}`}
                    className="text-sm text-gray-600"
                  >
                    <span className="font-medium text-slate-950">{entry.action}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {formatDateTime(entry.createdAt ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
