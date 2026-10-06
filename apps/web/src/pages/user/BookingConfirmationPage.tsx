import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BookingFacts, BookingNotFound, BookingSummaryCard } from '../../components/booking/BookingCard';
import { BookingSteps } from '../../components/booking/BookingSteps';
import { Container, PageShell } from '../../components/common/Container';
import { Notice } from '../../components/common/Feedback';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { useBookingDetail } from '../../hooks/useBookings';
import { useVenueDetail } from '../../hooks/useCourts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import { bookingStatusLabel, isSettled } from '../../types/booking';
import { toErrorMessage } from '../../utils/error';

/**
 * Receipt shown once the server has confirmed the booking.
 *
 * This page is deliberately read-only and polls only while the booking is still
 * a hold: if the customer lands here before payment settles, the page waits for
 * the server's verdict rather than declaring success optimistically.
 */
export function BookingConfirmationPage() {
  useDocumentTitle('Booking confirmed');
  const { bookingId = '' } = useParams();

  // Poll until the booking reaches a state the server will not change on its own.
  const [settled, setSettled] = useState(false);
  const bookingQuery = useBookingDetail(bookingId, !settled);
  const booking = bookingQuery.data?.booking;

  useEffect(() => {
    if (booking && isSettled(booking)) setSettled(true);
  }, [booking]);

  const venueQuery = useVenueDetail(booking?.venueId);
  const venueName = venueQuery.data?.venue.name;
  const pitchName = venueQuery.data?.pitches.find(pitch => pitch._id === booking?.pitchId)?.name;

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (booking?.status === 'confirmed') headingRef.current?.focus();
  }, [booking?.status]);

  if (bookingQuery.isLoading) {
    return (
      <PageShell>
        <Container size="narrow">
          <Loading message="Confirming your booking…" />
        </Container>
      </PageShell>
    );
  }

  if (bookingQuery.isError) {
    return (
      <PageShell>
        <Container size="narrow">
          <ErrorState
            message={toErrorMessage(bookingQuery.error, 'We could not load this booking.')}
            onRetry={() => void bookingQuery.refetch()}
          />
        </Container>
      </PageShell>
    );
  }

  if (!booking) {
    return (
      <PageShell>
        <Container size="narrow">
          <BookingNotFound />
        </Container>
      </PageShell>
    );
  }

  const confirmed = booking.status === 'confirmed';

  return (
    <PageShell>
      <Container size="narrow">
        <BookingSteps current={6} className="mb-6" />

        {confirmed ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-slate-950 focus:outline-none">
              Your court is booked
            </h1>
            <Notice variant="success" className="mt-4" title="Confirmation">
              Reference <strong>{booking.publicReference}</strong>. Keep this for your records.
            </Notice>
          </>
        ) : (
          <Notice variant="warning" title="Not confirmed yet">
            This booking is still {bookingStatusLabel(booking.status)}. It only becomes confirmed once payment
            settles — reload this page in a moment.
          </Notice>
        )}

        <div className="mt-6 space-y-6">
          <BookingSummaryCard booking={booking} venueName={venueName} pitchName={pitchName} />

          <Card>
            <BookingFacts booking={booking} />
          </Card>

          <div className="flex flex-wrap gap-3">
            <Link to={ROUTES.bookingDetail(booking._id)} className="btn-primary">
              View booking details
            </Link>
            <Link to={ROUTES.venues} className="btn-secondary">
              Book another court
            </Link>
          </div>
        </div>
      </Container>
    </PageShell>
  );
}