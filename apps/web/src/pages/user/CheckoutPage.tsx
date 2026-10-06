import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { BookingSteps } from '../../components/booking/BookingSteps';
import { CheckoutSummary, HoldPanel } from '../../components/booking/CheckoutPanels';
import { PaymentStatusCard } from '../../components/booking/PaymentStatusCard';
import { PriceBreakdown } from '../../components/booking/PriceBreakdown';
import { Container, PageShell } from '../../components/common/Container';
import { BackLink } from '../../components/common/Feedback';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useBookingDetail, useConfirmHold, useCreateHold } from '../../hooks/useBookings';
import { useCountdown } from '../../hooks/useCountdown';
import { useVenueDetail } from '../../hooks/useCourts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import { useBookingDraftStore } from '../../store/bookingDraft.store';
import type { Booking, PaymentState } from '../../types/booking';
import { toErrorMessage } from '../../utils/error';

/**
 * Review the picked slot, create the hold, and take payment.
 *
 * The hold is created exactly once per draft because the idempotency key lives in
 * the store — a re-render, a back navigation or a React strict-mode double
 * effect all resolve to the same hold rather than a second one.
 *
 * Confirmation is driven by the server: the booking only becomes `confirmed`
 * once the payment provider reports success via webhook, so the client polls the
 * booking rather than trusting an optimistic local state.
 */
export function CheckoutPage() {
  useDocumentTitle('Checkout');

  const navigate = useNavigate();
  const draft = useBookingDraftStore(state => state.draft);
  const idempotencyKey = useBookingDraftStore(state => state.idempotencyKey);
  const clearDraft = useBookingDraftStore(state => state.clearDraft);

  const [hold, setHold] = useState<Booking | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [developmentOnly, setDevelopmentOnly] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  const { mutateAsync: startHold, isPending } = useCreateHold();
  const { mutateAsync: confirmHold } = useConfirmHold();
  const venue = useVenueDetail(draft?.venueId);

  const holdId = hold?._id;
  const serverBooking = useBookingDetail(holdId, Boolean(holdId)).data?.booking;

  const pitch = venue.data?.pitches.find(item => item._id === draft?.pitchId);
  const venueName = venue.data?.venue.name ?? draft?.venueName ?? draft?.venueId;
  const pitchName = pitch?.name ?? draft?.pitchName ?? draft?.pitchId;

  const backToSlots = ROUTES.venueBooking(draft?.venueId ?? '', draft?.pitchId);

  // ---- hold + payment kick-off
  useEffect(() => {
    if (!draft || !idempotencyKey || startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    startHold({
      input: {
        venueId: draft.venueId,
        pitchId: draft.pitchId,
        startAt: draft.interval.startAt,
        durationMinutes: draft.durationMinutes,
      },
      idempotencyKey,
    })
      .then(({ booking, payment }) => {
        setHold(booking);
        setPaymentState(payment ? 'awaiting_payment' : 'failed');
        setDevelopmentOnly(payment?.developmentOnly ?? false);
      })
      .catch((cause: unknown) => {
        setError(toErrorMessage(cause, 'That slot is no longer available.'));
        setPaymentState('failed');
      });
  }, [draft, idempotencyKey, startHold]);

// ---- poll until the provider confirms or the hold lapses
useEffect(() => {
    if (!holdId || !serverBooking) return;
    if (serverBooking.status === 'confirmed') {
      setPaymentState('confirmed');
      navigate(ROUTES.confirmation(holdId), { replace: true });
      return;
    }
    if (serverBooking.paymentStatus === 'failed' || serverBooking.paymentStatus === 'uncertain') {
      setPaymentState('failed');
    } else if (serverBooking.paymentStatus === 'paid') {
      setPaymentState('paid');
    }
  }, [holdId, serverBooking, navigate]);

  // ---- last-resort confirm for providers that confirm out of band
  useEffect(() => {
    if (paymentState !== 'paid' || !holdId) return;
    confirmHold(holdId)
      .then(({ booking }) => {
        setHold(booking);
        setPaymentState('confirmed');
        navigate(ROUTES.confirmation(holdId), { replace: true });
      })
      .catch((cause: unknown) => setError(toErrorMessage(cause, 'We could not confirm this booking yet.')));
  }, [paymentState, holdId, confirmHold, navigate]);

  const amountMinor = serverBooking?.amountMinor ?? hold?.amountMinor ?? draft?.interval.priceMinor ?? 0;
  const currency = serverBooking?.currency ?? hold?.currency ?? draft?.interval.currency ?? 'USD';

  // Once the hold lapses there is no payment left to describe, so the mock
  // warning is withdrawn rather than left dangling on a dead checkout.
  const secondsLeft = useCountdown(hold?.holdExpiresAt);
  const holdExpired = secondsLeft === 0;

  const developmentMessage = useMemo(
    () =>
      developmentOnly
        ? 'No payment provider is configured, so this payment cannot complete. The hold will lapse and the slot will be released automatically.'
        : null,
    [developmentOnly]
  );

  if (!draft) {
    return (
      <PageShell tone="plain">
        <Container size="narrow" className="py-20">
          <h1 className="text-3xl font-bold text-slate-950">Choose a slot first</h1>
          <p className="mt-3 text-gray-600">
            Pick a court and a time so we can hold it for you while you review the booking.
          </p>
          <Link to={ROUTES.venues} className="btn-primary mt-6">
            Browse courts
          </Link>
        </Container>
      </PageShell>
    );
  }

  const restart = () => {
    clearDraft();
    navigate(backToSlots);
  };

  return (
    <PageShell>
      <Container size="wide">
        <BookingSteps current={5} className="mb-6" />
        <BackLink to={backToSlots}>Choose another slot</BackLink>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <CheckoutSummary
              venueName={venueName}
              pitchName={pitchName}
              interval={draft.interval}
              durationMinutes={draft.durationMinutes}
            >
              <PriceBreakdown
                className="mt-6 border-t border-gray-200 pt-2"
                amountMinor={amountMinor}
                currency={currency}
                durationMinutes={draft.durationMinutes}
                pending={isPending}
              />
            </CheckoutSummary>

            <Card>
              <PaymentStatusCard
                state={paymentState}
                amountMinor={amountMinor}
                currency={currency}
                developmentOnlyMessage={holdExpired ? null : developmentMessage}
                error={error ?? null}
              />
            </Card>
          </div>

          <HoldPanel
            booking={serverBooking ?? hold}
            state={paymentState}
            isPending={isPending || !started}
            backToAvailabilityHref={backToSlots}
            error={error}
            onRetry={restart}
          />
        </div>

        {paymentState === 'confirmed' && (
          <Card className="mt-8">
            <p className="text-sm text-gray-600">
              Booking reference <strong>{hold?.publicReference}</strong>.
            </p>
            <Button className="mt-4" onClick={() => navigate(ROUTES.confirmation(hold?._id ?? ''))}>
              View confirmation
            </Button>
          </Card>
        )}
      </Container>
    </PageShell>
  );
}