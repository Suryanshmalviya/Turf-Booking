import { useState } from 'react';

import type { Booking } from '../../types/booking';
import { formatDateTime, formatMoney } from '../../utils/format';
import { CANCEL_REASON_OPTIONS, cancelReasonSchema } from '../../utils/validation';
import { Notice } from '../common/Feedback';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

export interface CancelBookingDialogProps {
  open: boolean;
  booking: Booking;
  isPending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const OTHER_OPTION = 'Other';

/**
 * Cancellation confirmation.
 *
 * A reason is mandatory — the API rejects a blank one and the venue receives the
 * text. The refund outcome is stated up front from the policy snapshot stored on
 * the booking, so the customer knows what they are agreeing to before the
 * irreversible action rather than discovering it afterwards.
 */
export function CancelBookingDialog({
  open,
  booking,
  isPending,
  error,
  onClose,
  onConfirm,
}: CancelBookingDialogProps) {
  const [preset, setPreset] = useState<string>(CANCEL_REASON_OPTIONS[0]);
  const [custom, setCustom] = useState('');
  const [touched, setTouched] = useState(false);

  const usesCustom = preset === OTHER_OPTION;
  const resolvedReason = usesCustom ? custom.trim() : preset;
  const parsed = cancelReasonSchema.safeParse({ reason: resolvedReason });
  const errorMessage = touched && !parsed.success ? parsed.error.issues[0]?.message : undefined;

  const policy = booking.cancellationPolicy;
  const deadline = policy
    ? new Date(booking.startAt).getTime() - policy.freeUntilMinutesBefore * 60_000
    : 0;
  const refundEligible = policy !== undefined && Date.now() <= deadline;
  const refundPercent = refundEligible ? policy.refundPercent : 0;

  const close = () => {
    setPreset(CANCEL_REASON_OPTIONS[0]);
    setCustom('');
    setTouched(false);
    onClose();
  };

  const confirm = () => {
    setTouched(true);
    if (!parsed.success) return;
    onConfirm(resolvedReason);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Cancel this booking?"
      description={`${formatDateTime(booking.startAt)} · ${formatMoney(booking.amountMinor, booking.currency)}`}
      size="md"
      closeOnOverlayClick={!isPending}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isPending}>
            Keep booking
          </Button>
          <Button variant="danger" onClick={confirm} loading={isPending}>
            Cancel booking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Notice variant={refundEligible ? 'success' : 'warning'} title="Refund outcome">
          {refundEligible
            ? `You are inside the free cancellation window, so ${refundPercent}% of the amount will be refunded.`
            : 'This booking is outside the free cancellation window, so no refund will be issued.'}
        </Notice>

        <Select
          label="Reason for cancelling"
          required
          value={preset}
          options={CANCEL_REASON_OPTIONS.map(option => ({ value: option, label: option }))}
          onChange={event => setPreset(event.target.value)}
        />

        {usesCustom && (
          <Textarea
            label="Tell us more"
            required
            rows={3}
            maxLength={500}
            value={custom}
            error={errorMessage}
            hint="Between 3 and 500 characters."
            onChange={event => setCustom(event.target.value)}
            onBlur={() => setTouched(true)}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}