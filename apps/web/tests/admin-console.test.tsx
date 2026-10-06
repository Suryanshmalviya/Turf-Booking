import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminBookingsPage } from '../src/pages/admin/AdminBookingsPage';
import { AdminPaymentsPage } from '../src/pages/admin/AdminPaymentsPage';
import { AdminReportsPage } from '../src/pages/admin/AdminReportsPage';
import type { AdminBooking } from '../src/types/admin';
import { renderWithProviders } from './helpers/render';

const adminApi = vi.hoisted(() => ({
  bookings: vi.fn(),
  bookingPayments: vi.fn(),
  report: vi.fn(),
  database: vi.fn(),
}));
const bookingApi = vi.hoisted(() => ({ cancel: vi.fn() }));

vi.mock('../src/services/admin.api', () => ({ adminApi }));
vi.mock('../src/services/booking.api', () => ({ bookingApi }));

/** A booking row in a status the server will accept a cancellation for. */
function adminBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    _id: 'booking-id',
    publicReference: 'PB-7QX2KM',
    venueId: 'venue-id',
    pitchId: 'pitch-id',
    startAt: '2026-09-24T10:00:00.000Z',
    endAt: '2026-09-24T11:00:00.000Z',
    status: 'confirmed',
    paymentStatus: 'paid',
    amountMinor: 120000,
    currency: 'INR',
    ...overrides,
  };
}

/** Wraps rows in the paged envelope `GET /admin/bookings` returns. */
function page(rows: AdminBooking[]) {
  return { items: rows, page: 1, limit: 20, total: rows.length };
}

/**
 * The first render of a console section pulls in its whole subtree, which can
 * outrun the default 1s query timeout on a cold module graph.
 */
const READY = { timeout: 5000 } as const;

describe('admin booking administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.bookings.mockResolvedValue(page([adminBooking()]));
    bookingApi.cancel.mockResolvedValue({
      booking: { _id: 'booking-id', status: 'cancelled' },
    });
  });

  it('offers cancellation only for statuses the server will accept', async () => {
    adminApi.bookings.mockResolvedValue(
      page([
        adminBooking(),
        adminBooking({ _id: 'b2', publicReference: 'PB-DONE01', status: 'completed' }),
        adminBooking({ _id: 'b3', publicReference: 'PB-CANCEL', status: 'cancelled' }),
      ])
    );

    renderWithProviders(<AdminBookingsPage />);

    // One cancel button for the single cancelable row.
    expect(await screen.findByRole('button', { name: 'Cancel' }, READY)).toBeInTheDocument();
    // The two terminal rows are reported as such rather than offering a write.
    expect(screen.getAllByText('Not cancellable')).toHaveLength(2);
  });

  it('requires a reason before the cancellation can be sent', async () => {
    renderWithProviders(<AdminBookingsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }, READY));

    // The reason is audited server-side, so confirm stays disabled until it exists.
    const confirm = await screen.findByRole('button', { name: 'Cancel booking' }, READY);
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/cancellation reason/i), { target: { value: 'Court resurfacing' } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(bookingApi.cancel).toHaveBeenCalledTimes(1));

    const [bookingId, input] = bookingApi.cancel.mock.calls[0] as [string, { reason: string }];
    expect(bookingId).toBe('booking-id');
    expect(input.reason).toBe('Court resurfacing');
  });

  it('states that refunds follow the stored policy snapshot before confirming', async () => {
    renderWithProviders(<AdminBookingsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }, READY));

    expect(await screen.findByText(/policy snapshot stored on the booking/i, undefined, READY)).toBeInTheDocument();
  });
});

describe('admin payment reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.bookings.mockResolvedValue(page([adminBooking()]));
    adminApi.bookingPayments.mockResolvedValue({
      payments: [{ _id: 'p1', status: 'paid', amountMinor: 120000, currency: 'INR' }],
      refunds: [
        { _id: 'r1', status: 'succeeded', amountMinor: 120000, currency: 'INR', reason: 'Late cancellation' },
      ],
      audit: [{ _id: 'a1', action: 'booking.cancelled', createdAt: '2026-09-23T09:00:00.000Z' }],
    });
  });

  it('reports refund outcomes without offering a refund action', async () => {
    renderWithProviders(<AdminPaymentsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Payment detail' }, READY));

    expect(await screen.findByText(/refunded successfully/i, undefined, READY)).toBeInTheDocument();
    expect(screen.getByText(/reports the outcome rather than issuing refunds/i)).toBeInTheDocument();
    // No backend endpoint issues refunds, so the view must not imply one exists.
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
  });
});

describe('admin reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.report.mockResolvedValue({
      definitions: { utilization: 'Booked minutes per venue; the denominator is not inferred.' },
      bookingCounts: [{ _id: 'confirmed', count: 12 }],
      utilization: [{ _id: 'venue-id', bookedMinutes: 900, bookings: 15 }],
      cancellations: 3,
      grossBookingValue: [{ _id: 'INR', amountMinor: 500000, bookings: 20 }],
      refunds: [{ _id: 'INR', amountMinor: 120000, count: 2 }],
      reviewAverages: [],
    });
    adminApi.database.mockResolvedValue({
      status: 'connected',
      databaseName: 'bookcourt',
      host: 'localhost',
      pingMs: 4,
      readyState: 1,
      counts: {
        users: 10,
        venues: 2,
        pitches: 8,
        bookings: 40,
        authSessions: 0,
        availabilityRules: 0,
        priceRules: 0,
        paymentAttempts: 40,
        refunds: 2,
        auditLogs: 0,
        reviews: 0,
        notifications: 0,
      },
    });
  });

  it('reports booked hours instead of an inferred utilisation percentage', async () => {
    renderWithProviders(<AdminReportsPage />);

    // The server does not join configured operating minutes, so the view must not
    // present a utilisation percentage it cannot derive.
    expect(await screen.findByText(/hours rather than a percentage/i, undefined, READY)).toBeInTheDocument();
    // The server's own definition is surfaced rather than paraphrased away.
    expect(await screen.findByText(/denominator is not inferred/i, undefined, READY)).toBeInTheDocument();
  });
});