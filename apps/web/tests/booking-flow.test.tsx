import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingPage } from '../src/pages/user/BookingPage';
import { CheckoutPage } from '../src/pages/user/CheckoutPage';
import { useBookingDraftStore } from '../src/store/bookingDraft.store';
import type { AvailabilityInterval, BookingDraft } from '../src/types/booking';
import { renderWithProviders } from './helpers/render';

const courtApi = vi.hoisted(() => ({ detail: vi.fn(), availability: vi.fn() }));
const bookingApi = vi.hoisted(() => ({ createHold: vi.fn() }));
const paymentApi = vi.hoisted(() => ({ createAttempt: vi.fn() }));

vi.mock('../src/services/court.api', () => ({ courtApi }));
vi.mock('../src/services/booking.api', () => ({ bookingApi }));
vi.mock('../src/services/payment.api', () => ({ paymentApi }));

const interval: AvailabilityInterval = {
  startAt: '2026-09-24T10:00:00.000Z',
  endAt: '2026-09-24T11:00:00.000Z',
  startLocal: '24/09/2026, 15:30',
  endLocal: '24/09/2026, 16:30',
  timezone: 'Asia/Kolkata',
  priceMinor: 1200,
  currency: 'INR',
};

const detail = {
  venue: {
    _id: 'venue-id',
    name: 'Court House',
    timezone: 'Asia/Kolkata',
    address: { line1: '1 Main St', city: 'Pune', region: 'MH', postalCode: '411001', country: 'IN' },
  },
  pitches: [{ _id: 'pitch-id', name: 'Court 1', indoor: true, isActive: true }],
};

const draft: BookingDraft = {
  venueId: 'venue-id',
  venueName: 'Court House',
  pitchId: 'pitch-id',
  pitchName: 'Court 1',
  date: '2026-09-24',
  durationMinutes: 60,
  interval,
};

/** Renders BookingPage behind a real route so `useParams` resolves. */
function renderBookingPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/venues/:venueId/book" element={<BookingPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
    </Routes>,
    { route: '/venues/venue-id/book' }
  );
}

describe('customer booking flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBookingDraftStore.getState().clearDraft();

    courtApi.detail.mockResolvedValue(detail);
    courtApi.availability.mockResolvedValue({ intervals: [interval] });
    bookingApi.createHold.mockResolvedValue({
      booking: {
        _id: 'booking-id',
        status: 'held',
        paymentStatus: 'pending',
        holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        amountMinor: 1200,
        currency: 'INR',
      },
    });
    paymentApi.createAttempt.mockResolvedValue({
      attempt: { status: 'pending', amountMinor: 1200, currency: 'INR' },
      developmentOnly: true,
    });
  });

  it('shows a slot only after the availability request resolves', async () => {
    renderBookingPage();

    expect(await screen.findByText('Court 1 · Indoor')).toBeInTheDocument();
    expect(screen.getByText('No times loaded')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check live availability' }));

    expect(await screen.findByRole('button', { name: /15:30/ })).toBeInTheDocument();
    expect(courtApi.availability).toHaveBeenCalledWith(
      'venue-id',
      'pitch-id',
      expect.any(String),
      60,
      expect.anything()
    );
  });

  it('stores the chosen slot in the booking draft', async () => {
    renderBookingPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Check live availability' }));
    fireEvent.click(await screen.findByRole('button', { name: /15:30/ }));

    await waitFor(() => {
      expect(useBookingDraftStore.getState().draft?.interval.startAt).toBe(interval.startAt);
    });
    expect(useBookingDraftStore.getState().idempotencyKey).toBeTruthy();
  });

  it('creates a hold and shows the countdown', async () => {
    useBookingDraftStore.getState().setDraft(draft);

    renderWithProviders(<CheckoutPage />, { route: '/checkout' });

    expect(await screen.findByText('Review your booking')).toBeInTheDocument();
    await waitFor(() => expect(bookingApi.createHold).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/This slot is reserved for you for/)).toBeInTheDocument();
    expect(screen.getByText(/No payment provider is configured/)).toBeInTheDocument();
  });

  it('hides payment details once the hold has expired', async () => {
    useBookingDraftStore.getState().setDraft(draft);
    bookingApi.createHold.mockResolvedValue({
      booking: {
        _id: 'booking-id',
        status: 'held',
        paymentStatus: 'pending',
        holdExpiresAt: new Date(Date.now() - 1000).toISOString(),
        amountMinor: 1200,
        currency: 'INR',
      },
    });

    renderWithProviders(<CheckoutPage />, { route: '/checkout' });

    expect(await screen.findByText(/hold has expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/No payment provider is configured/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose a new slot/i })).toBeInTheDocument();
  });

  it('sends the customer back to the venue list when no slot is selected', () => {
    renderWithProviders(<CheckoutPage />, { route: '/checkout' });

    expect(screen.getByText('Choose a slot first')).toBeInTheDocument();
    expect(bookingApi.createHold).not.toHaveBeenCalled();
  });
});