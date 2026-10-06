import { Link } from 'react-router-dom';

import { useCountdown } from '../../hooks/useCountdown';
import type { Booking, PaymentState } from '../../types/booking';
import { bookingStatusLabel, paymentStatusLabel } from '../../types/booking';
import { formatCountdown } from '../../utils/format';
import { Notice } from '../common/Feedback';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Loading';
import { PaymentStatusBadge } from './PaymentStatusCard';

export interface CheckoutSummaryProps {
  /** `undefined` until the venue detail query resolves. */
  venueName?: string;
  pitchName?: string;
  interval: { startLocal: string; endLocal: string; timezone: string };
  durationMinutes: number;
  children?: React.ReactNode;
}

/**
 * Read-only recap of the slot the customer picked.
 *
 * Venue and court names arrive from a separate request, so they may still be
 * loading; ids stand in until then rather than rendering a blank heading.
 */
export function CheckoutSummary({
  venueName,
  pitchName,
  interval,
  durationMinutes,
  children,
}: CheckoutSummaryProps) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700">Checkout</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Review your booking</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <SummaryFact label="Venue" value={venueName ?? 'Loading venue…'} />
        <SummaryFact label="Court" value={pitchName ?? 'Loading court…'} />
        <SummaryFact label="Local time" value={`${interval.startLocal} – ${interval.endLocal}`} />
        <SummaryFact label="Timezone" value={interval.timezone} />
        <SummaryFact label="Duration" value={`${durationMinutes} minutes`} />
      </dl>

      {children}
    </Card>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}

export interface HoldPanelProps {
  /** The hold created for this checkout, or `null` before the hold succeeds. */
  booking: Booking | null;
  state: PaymentState;
  /** `true` while the hold or payment request is in flight. */
  isPending: boolean;
  /** Href back to the availability grid when the hold is gone. */
  backToAvailabilityHref: string;
  error?: string;
  onRetry: () => void;
}

/**
 * Live hold countdown plus the payment state for the current attempt.
 *
 * `useCountdown` returns `null` while there is no deadline, which is what
 * separates "no hold yet" from "hold expired" — conflating the two would tell a
 * customer to pick a new slot when they simply have not paid yet.
 */
export function HoldPanel({
  booking,
  state,
  isPending,
  backToAvailabilityHref,
  error,
  onRetry,
}: HoldPanelProps) {
  const secondsLeft = useCountdown(booking?.holdExpiresAt);
  const hasDeadline = secondsLeft !== null;
  const expired = hasDeadline && secondsLeft === 0;

  return (
    <Card className="h-fit">
      <CardHeader title="Your reservation" />

      {isPending && (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <Spinner className="h-4 w-4" />
          Confirming the slot with the server…
        </p>
      )}

      {error && !isPending && (
        <Notice variant="danger" className="mt-4" title="We could not complete that step">
          {error}
        </Notice>
      )}

      {!isPending && !error && expired && (
        <>
          <Notice variant="danger" className="mt-4" title="This hold has expired">
            The slot has been released. Pick another time to continue.
          </Notice>
          <Button block className="mt-6" onClick={onRetry}>
            Choose a new slot
          </Button>
        </>
      )}

      {!isPending && !error && hasDeadline && !expired && (
        <>
          <p className="mt-4 text-sm text-gray-600">This slot is reserved for you for</p>
          <p
            className="mt-2 font-mono text-4xl font-bold text-slate-950 tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {formatCountdown(secondsLeft)}
          </p>
          <p className="sr-only" role="status">
            Hold expires in {formatCountdown(secondsLeft)}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <span className="text-sm text-gray-600">Payment status</span>
            <PaymentStatusBadge state={state} />
          </div>

          {booking && (
            <p className="mt-2 text-xs text-gray-500">
              Held as {bookingStatusLabel(booking.status)} · payment{' '}
              {paymentStatusLabel(booking.paymentStatus)}
            </p>
          )}

          {state === 'creating_hold' && (
            <Notice variant="warning" className="mt-6" title="Hold not issued yet">
              The countdown appears once the server has locked the slot.
            </Notice>
          )}
        </>
      )}

      {!isPending && !error && !hasDeadline && (
        <p className="mt-4 text-sm text-gray-500">
          No active hold yet. Choose a slot from the{' '}
          <Link
            to={backToAvailabilityHref}
            className="font-semibold text-primary-700 hover:underline"
          >
            availability grid
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
