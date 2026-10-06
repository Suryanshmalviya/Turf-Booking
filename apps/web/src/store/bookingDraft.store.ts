import { create } from 'zustand';

import type { Booking, BookingDraft } from '../types/booking';
import { newIdempotencyKey } from '../utils/id';

/**
 * The slot the customer is about to reserve.
 *
 * State lives in the store rather than in router state alone so a hard refresh
 * mid-flow can recover the selection and send the customer back to the
 * availability grid instead of stranding them.
 *
 * `reschedulingFrom` carries the booking being moved. Rescheduling is modelled
 * as "hold the new slot, then cancel the old one", because the API only exposes
 * create-hold and cancel — it has no reschedule mutation of its own.
 */
interface BookingDraftState {
  draft: BookingDraft | null;
  /** `Idempotency-Key` for the hold. Generated once per draft, reused on retry. */
  idempotencyKey: string | null;
  /** Booking being rescheduled, if this flow started from booking details. */
  reschedulingFrom: Booking | null;
  setDraft: (draft: BookingDraft, options?: { reschedulingFrom?: Booking }) => void;
  clearDraft: () => void;
}

export const useBookingDraftStore = create<BookingDraftState>()(set => ({
  draft: null,
  idempotencyKey: null,
  reschedulingFrom: null,
  setDraft: (draft, options) =>
    set({
      draft,
      idempotencyKey: draft ? newIdempotencyKey('hold') : null,
      reschedulingFrom: options?.reschedulingFrom ?? null,
    }),
  clearDraft: () => set({ draft: null, idempotencyKey: null, reschedulingFrom: null }),
}));