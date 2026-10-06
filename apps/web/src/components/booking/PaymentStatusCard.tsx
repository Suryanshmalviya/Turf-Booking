import type { PaymentState } from '../../types/booking';
import type { BadgeTone } from '../../types/ui';
import { formatMoney } from '../../utils/format';
import { Badge } from '../ui/Badge';

/** Tone + label for each point in the checkout state machine. */
const STATE_PRESENTATION: Record<PaymentState, { tone: BadgeTone; label: string }> = {
  idle: { tone: 'neutral', label: 'Not started' },
  creating_hold: { tone: 'warning', label: 'Reserving slot' },
  awaiting_payment: { tone: 'info', label: 'Awaiting payment' },
  paid: { tone: 'success', label: 'Paid' },
  confirmed: { tone: 'success', label: 'Confirmed' },
  failed: { tone: 'danger', label: 'Payment failed' },
};

export interface PaymentStatusBadgeProps {
  state: PaymentState;
  className?: string;
}

/** Compact payment-state pill for the checkout panel. */
export function PaymentStatusBadge({ state, className }: PaymentStatusBadgeProps) {
  const { tone, label } = STATE_PRESENTATION[state];
  return (
    <Badge tone={tone} className={className}>
      <span aria-live="polite">{label}</span>
    </Badge>
  );
}

export interface PaymentStatusCardProps {
  state: PaymentState;
  amountMinor: number;
  currency: string;
  /** Non-null when the server is running its no-provider payment mock. */
  developmentOnlyMessage?: string | null;
  error?: string | null;
  className?: string;
}

/**
 * Explains what the payment step is doing.
 *
 * No card details are collected in this client: the server owns the provider
 * integration, so this panel reports progress rather than pretending to take
 * payment input.
 */
export function PaymentStatusCard({
  state,
  amountMinor,
  currency,
  developmentOnlyMessage,
  error,
  className,
}: PaymentStatusCardProps) {
  const { label } = STATE_PRESENTATION[state];

  return (
    <section
      aria-label="Payment"
      aria-busy={state === 'creating_hold' || state === 'awaiting_payment' || undefined}
      className={className}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xl font-bold text-slate-950 tabular-nums">
          {formatMoney(amountMinor, currency)}
        </p>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        {state === 'idle' && 'Start payment to reserve this slot.'}
        {state === 'creating_hold' && 'Locking the slot on the server before taking payment.'}
        {state === 'awaiting_payment' && 'Waiting for the payment provider to confirm.'}
        {state === 'paid' && 'Payment received. Confirming your booking.'}
        {state === 'confirmed' && 'Your booking is confirmed.'}
        {state === 'failed' && 'The payment could not be completed.'}
      </p>

      {developmentOnlyMessage && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {developmentOnlyMessage}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
