import { formatMoney } from '../../utils/format';
import { DescriptionList } from '../common/DescriptionList';
import { Notice } from '../common/Feedback';

export interface PriceBreakdownProps {
  /** Total for the slot in minor units, as priced by the server. */
  amountMinor: number;
  currency: string;
  durationMinutes: number;
  /** Per-hour rate in minor units, when the pitch exposes one. */
  hourlyRateMinor?: number;
  /** Extra lines such as a venue service fee, already in minor units. */
  extraLines?: Array<{ label: string; amountMinor: number }>;
  /** `true` while the figures are still being confirmed by the server. */
  pending?: boolean;
  className?: string;
}

/**
 * Itemised cost for the selected slot.
 *
 * The total always comes from the server (`AvailabilityInterval.priceMinor` on
 * the grid, `Booking.amountMinor` after a hold) — this component never
 * recomputes the total itself, because the server also accounts for pitch
 * buffers and off-peak rules that the client does not model. The derived
 * hourly rate is shown for comparison only.
 */
export function PriceBreakdown({
  amountMinor,
  currency,
  durationMinutes,
  hourlyRateMinor,
  extraLines = [],
  pending = false,
  className,
}: PriceBreakdownProps) {
  const derivedRate =
    hourlyRateMinor ?? (durationMinutes > 0 ? Math.round((amountMinor / durationMinutes) * 60) : undefined);
  const extrasTotal = extraLines.reduce((sum, line) => sum + line.amountMinor, 0);
  const subtotal = amountMinor - extrasTotal;

  return (
    <div className={className}>
      <DescriptionList
        items={[
          {
            label: 'Duration',
            value: `${durationMinutes} min`,
          },
          ...(derivedRate !== undefined
            ? [{ label: 'Rate', value: `${formatMoney(derivedRate, currency)} / hour` }]
            : []),
          ...(extrasTotal > 0
            ? [{ label: 'Court time', value: formatMoney(subtotal, currency) }]
            : []),
          ...extraLines.map(line => ({
            label: line.label,
            value: formatMoney(line.amountMinor, currency),
          })),
        ]}
      />

      <div className="mt-4 flex items-baseline justify-between border-t border-gray-200 pt-4">
        <p className="text-sm font-semibold text-gray-700">Total payable</p>
        <p
          className="text-2xl font-bold text-slate-950 tabular-nums"
          aria-live={pending ? 'polite' : undefined}
          aria-busy={pending || undefined}
        >
          {pending ? 'Calculating…' : formatMoney(amountMinor, currency)}
        </p>
      </div>

      {pending && (
        <p className="mt-2 text-xs text-gray-500">
          The server prices every interval. This figure refreshes once pricing is confirmed.
        </p>
      )}
    </div>
  );
}

export interface PolicyNoticeProps {
  freeUntilMinutesBefore: number;
  refundPercent: number;
  startAt: string;
  className?: string;
}

/**
 * Restates the refund policy snapshot stored on the booking.
 *
 * The snapshot is captured when the hold is created, so what the customer reads
 * here is exactly the policy that will be applied if they cancel — not a value
 * recomputed from possibly-changed venue settings.
 */
export function PolicyNotice({
  freeUntilMinutesBefore,
  refundPercent,
  startAt,
  className,
}: PolicyNoticeProps) {
  const hours = Math.round(freeUntilMinutesBefore / 60);
  const deadline = new Date(startAt).getTime() - freeUntilMinutesBefore * 60_000;
  const eligible = Date.now() <= deadline;

  return (
    <Notice
      variant={eligible ? 'success' : 'warning'}
      className={className}
      title="Cancellation policy"
    >
      {eligible
        ? `Cancel at least ${hours} hours before the start time for a ${refundPercent}% refund.`
        : `This booking is inside the ${hours}-hour free cancellation window, so cancelling now refunds ${refundPercent === 0 ? 'nothing' : `${refundPercent}%`}.`}
    </Notice>
  );
}