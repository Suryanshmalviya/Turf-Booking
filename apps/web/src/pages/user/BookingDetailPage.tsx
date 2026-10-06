import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  BookingFacts,
  BookingNotFound,
  BookingSummaryCard,
} from '../../components/booking/BookingCard';
import { BookingSteps } from '../../components/booking/BookingSteps';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog';
import { PolicyNotice } from '../../components/booking/PriceBreakdown';
import { RescheduleDialog } from '../../components/booking/RescheduleDialog';
import { Container, PageShell } from '../../components/common/Container';
import { BackLink, Notice } from '../../components/common/Feedback';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loading } from '../../components/ui/Loading';
import { useBookingDetail, useCancelBooking } from '../../hooks/useBookings';
import { useVenueDetail } from '../../hooks/useCourts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../hooks/useToast';
import { ROUTES } from '../../routes/paths';
import { isMutable } from '../../types/booking';
import { toErrorMessage } from '../../utils/error';

export function BookingDetailPage() {
  useDocumentTitle('Booking detail');
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const bookingQuery = useBookingDetail(bookingId);
  const booking = bookingQuery.data?.booking;

  const venueQuery = useVenueDetail(booking?.venueId);
  const venueName = venueQuery.data?.venue.name;
  const pitchName = venueQuery.data?.pitches.find(pitch => pitch._id === booking?.pitchId)?.name;

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReschedule, setConfirmReschedule] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const cancelBooking = useCancelBooking();
  const mutable = booking ? isMutable(booking) : false;

  const onCancel = (reason: string) => {
    setActionError(null);
    cancelBooking.mutate(
      { bookingId, reason },
      {
        onSuccess: ({ booking: cancelled }) => {
          setConfirmCancel(false);
          toast.push({
            variant: 'success',
            title: 'Booking cancelled',
            description: cancelled.publicReference,
          });
        },
        onError: (cause: unknown) =>
          setActionError(toErrorMessage(cause, 'We could not cancel this booking.')),
      }
    );
  };

  return (
    <PageShell>
      <Container size="narrow">
        <BookingSteps current={7} className="mb-6" />
        <BackLink to={ROUTES.bookings}>My bookings</BackLink>

        {bookingQuery.isLoading && <Loading message="Loading booking…" />}

        {bookingQuery.isError && (
          <ErrorState
            className="mt-8"
            message={toErrorMessage(bookingQuery.error, 'We could not load this booking.')}
            onRetry={() => void bookingQuery.refetch()}
          />
        )}

        {booking && (
          <div className="mt-6 space-y-6">
            <BookingSummaryCard booking={booking} venueName={venueName} pitchName={pitchName} />

            <Card>
              <CardHeader title="When and where" />
              <BookingFacts booking={booking} className="mt-4" />
            </Card>

            {booking.cancellationPolicy && mutable && (
              <PolicyNotice
                freeUntilMinutesBefore={booking.cancellationPolicy.freeUntilMinutesBefore}
                refundPercent={booking.cancellationPolicy.refundPercent}
                startAt={booking.startAt}
              />
            )}

            {booking.status === 'cancelled' && (
              <Notice variant="info" title="This booking was cancelled">
                {booking.cancellationReason
                  ? `Reason given: ${booking.cancellationReason}`
                  : 'No reason was recorded.'}
              </Notice>
            )}

            {booking.status === 'held' && (
              <Notice variant="warning" title="Payment is not complete">
                This slot is only held until the deadline. It becomes a confirmed booking once
                payment settles.
              </Notice>
            )}

            <Card>
              <CardHeader
                title="Manage this booking"
                description={mutable ? undefined : 'This booking can no longer be changed.'}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => navigate(ROUTES.bookings)}>
                  All bookings
                </Button>
                <Button
                  variant="outline"
                  disabled={!mutable}
                  onClick={() => {
                    setActionError(null);
                    setConfirmReschedule(true);
                  }}
                >
                  Reschedule
                </Button>
                <Button variant="danger" disabled={!mutable} onClick={() => setConfirmCancel(true)}>
                  Cancel booking
                </Button>
              </div>
              {!mutable && (
                <p className="mt-3 text-sm text-gray-500">
                  Cancelling and rescheduling are only available for active bookings that have not
                  started.
                </p>
              )}
            </Card>
          </div>
        )}

        {!bookingQuery.isLoading && !bookingQuery.isError && !booking && <BookingNotFound />}

        {booking && (
          <>
            <CancelBookingDialog
              open={confirmCancel}
              booking={booking}
              isPending={cancelBooking.isPending}
              error={actionError}
              onClose={() => setConfirmCancel(false)}
              onConfirm={onCancel}
            />
            <RescheduleDialog
              open={confirmReschedule}
              booking={booking}
              venueName={venueName}
              onClose={() => setConfirmReschedule(false)}
            />
          </>
        )}
      </Container>
    </PageShell>
  );
}
