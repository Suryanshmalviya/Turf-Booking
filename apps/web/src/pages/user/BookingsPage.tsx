import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BookingCard } from '../../components/booking/BookingCard';
import { Container, PageHeader, PageShell } from '../../components/common/Container';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { Select } from '../../components/ui/Select';
import { useMyBookings } from '../../hooks/useBookings';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import type { BookingStatus } from '../../types/booking';
import { BOOKING_STATUSES, bookingStatusLabel } from '../../types/booking';
import { toErrorMessage } from '../../utils/error';

const STATUS_FILTERS = [
  { value: '', label: 'All bookings' },
  ...BOOKING_STATUSES.map(status => ({ value: status, label: bookingStatusLabel(status) })),
];

/** The signed-in customer's booking history with a status filter. */
export function BookingsPage() {
  useDocumentTitle('My bookings');

  const [status, setStatus] = useState<BookingStatus | ''>('');
  const bookings = useMyBookings(status ? { status } : {});
  const rows = bookings.data?.items ?? [];

  return (
    <PageShell>
      <Container>
        <PageHeader
          eyebrow="Customer area"
          title="My bookings"
          description="Every court you have reserved, newest first."
          actions={
            <Select
              label="Filter by status"
              hideLabel
              className="w-auto"
              value={status}
              options={STATUS_FILTERS}
              onChange={event => setStatus(event.target.value as BookingStatus | '')}
            />
          }
        />

        <div className="mt-8">
          {bookings.isLoading && <Loading message="Loading your bookings…" />}

          {bookings.isError && (
            <ErrorState
              message={toErrorMessage(bookings.error, 'We could not load your bookings.')}
              onRetry={() => void bookings.refetch()}
            />
          )}

          {bookings.data && rows.length === 0 && (
            <EmptyState
              title="No bookings yet"
              description="Once you reserve a court it will appear here."
              action={
                <Link to={ROUTES.venues} className="btn-primary">
                  Browse courts
                </Link>
              }
            />
          )}

          {rows.length > 0 && (
            <div className="space-y-4">
              {rows.map(booking => (
                <BookingCard key={booking._id} booking={booking} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </PageShell>
  );
}
