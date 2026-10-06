import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBookingDraftStore } from '../../store/bookingDraft.store';
import type { Booking } from '../../types/booking';
import { formatDateTime, formatMoney } from '../../utils/format';
import { Notice } from '../common/Feedback';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface RescheduleDialogProps {
  open: boolean;
  booking: Booking;
  onClose: () => void;
  /** Venue name for the confirmation copy; falls back to the id. */
  venueName?: string;
}

/**
 * Entry point for moving a booking to a different time.
 *
 * The API exposes create-hold and cancel but no reschedule mutation, so moving a
 * booking is modelled as "hold the new slot, then cancel the original". This
 * dialog only confirms the intent and records the booking being moved; the swap
 * itself is completed on the availability grid and the detail page.
 *
 * The booking is *not* cancelled here. Cancelling first would release the
 * original slot and leave the customer with nothing if the new slot is taken.
 */
export function RescheduleDialog({ open, booking, onClose, venueName }: RescheduleDialogProps) {
  const navigate = useNavigate();
  const setDraft = useBookingDraftStore(state => state.setDraft);
  const [error] = useState<string | undefined>();

  const startReschedule = () => {
    setDraft(
      {
        venueId: booking.venueId,
        venueName,
        pitchId: booking.pitchId,
        date: booking.startAt.slice(0, 10),
        durationMinutes: Math.round(
          (new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60_000
        ),
        interval: {
          startAt: booking.startAt,
          endAt: booking.endAt,
          startLocal: formatDateTime(booking.startAt),
          endLocal: formatDateTime(booking.endAt),
          timezone: booking.timezone,
          priceMinor: booking.amountMinor,
          currency: booking.currency,
        },
      },
      { reschedulingFrom: booking }
    );
    onClose();
    navigate(`/courts/${booking.venueId}/availability?pitchId=${booking.pitchId}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule this booking?"
      description={`${formatDateTime(booking.startAt)} · ${formatMoney(booking.amountMinor, booking.currency)}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep current time
          </Button>
          <Button onClick={startReschedule}>Choose a new time</Button>
        </>
      }
    >
      <Notice variant="info" title="How rescheduling works">
        Pick a new slot first. Your current booking stays active until you confirm the new time, so you
        never lose the original slot while deciding.
      </Notice>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  );
}