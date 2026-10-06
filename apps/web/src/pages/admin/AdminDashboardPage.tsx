import { Link } from 'react-router-dom';

import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { BarChartCard, ChartCard, PieChartCard } from '../../components/ui/Chart';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Loading';
import {
  useBookingCount,
  useDatabaseStatus,
  useLifetimeReport,
  useRecentBookings,
  useVenueQueue,
} from '../../hooks/useAdmin';
import { PATHS } from '../../routes/paths';
import {
  BOOKING_STATUS_TONE,
  bookingStatusLabel,
  PAYMENT_STATUS_TONE,
  paymentStatusLabel,
} from '../../types/booking';
import type { AdminMetric } from '../../utils/adminMetrics';
import {
  bookingStatusMix,
  buildMetrics,
  revenueByCurrency,
  todayWindow,
  upcomingWindow,
  utilisationChartData,
  utilisationRows,
} from '../../utils/adminMetrics';
import { cn } from '../../utils/cn';
import { toErrorMessage } from '../../utils/error';
import { formatCount, formatDateTime, formatDuration, formatMoney } from '../../utils/format';

/**
 * Operational overview.
 *
 * Composed from the aggregate report, the collection counts and two paged
 * booking totals, because the API has no single stats endpoint. Each tile
 * states where its number came from, and the utilisation panel deliberately
 * reports booked hours instead of a percentage the API cannot support.
 */
export function AdminDashboardPage() {
  const today = todayWindow();
  const upcoming = upcomingWindow();

  const database = useDatabaseStatus(true);
  const report = useLifetimeReport(true);
  const todayCount = useBookingCount({ from: today.from, to: today.to });
  const upcomingCount = useBookingCount({ from: upcoming.from, to: upcoming.to });
  const recent = useRecentBookings(true);
  const queue = useVenueQueue(true);

  const metrics = buildMetrics({
    ...(database.data ? { database: database.data } : {}),
    ...(report.data ? { report: report.data } : {}),
    ...(todayCount.data !== undefined ? { todayCount: todayCount.data } : {}),
    ...(upcomingCount.data !== undefined ? { upcomingCount: upcomingCount.data } : {}),
    ...(queue.data ? { queueCount: queue.data.total } : {}),
  });

  const utilisation = utilisationRows(report.data);
  const statusMix = bookingStatusMix(report.data);
  const revenue = revenueByCurrency(report.data);
  const loading = database.isLoading || report.isLoading;
  const failed = database.isError || report.isError;

  return (
    <div className="space-y-8">
      {failed && (
        <ErrorState
          message={toErrorMessage(database.error ?? report.error, 'We could not load dashboard metrics.')}
          onRetry={() => {
            void database.refetch();
            void report.refetch();
          }}
        />
      )}

      <MetricGrid metrics={metrics} isLoading={loading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Booking status mix"
          description="Every booking whose start falls in the reporting window, grouped by status."
        >
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <PieChartCard
              data={statusMix}
              nameKey="status"
              xKey="status"
              series={[{ dataKey: 'count', name: 'Bookings' }]}
              valueFormatter={formatCount}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Revenue by currency"
          description="Gross value of confirmed and completed bookings, in major units."
        >
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <BarChartCard
              data={revenue}
              xKey="currency"
              series={[{ dataKey: 'gross', name: 'Gross revenue' }]}
              valueFormatter={value => value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            />
          )}
        </ChartCard>
      </div>

      <Card>
        <CardHeader
          title="Court utilisation"
          description="Booked minutes per venue over the reporting window."
          actions={
            <Link to={PATHS.adminReports} className="btn-secondary">
              Full report
            </Link>
          }
        />

        {loading ? (
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : utilisation.length === 0 ? (
          <p className="mt-5 text-sm text-gray-600">
            No confirmed or completed bookings have been recorded yet.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <BarChartCard
                data={utilisationChartData(report.data, venueId => venueId.slice(-6))}
                xKey="venue"
                series={[{ dataKey: 'hours', name: 'Booked hours' }]}
                layout="vertical"
                height={Math.max(220, Math.min(utilisation.length, 12) * 34)}
                valueFormatter={value => `${value.toLocaleString()} h`}
              />
            </div>

            <Notice variant="info" className="mt-5">
              {report.data?.definitions.utilization ??
                'Utilisation is reported as booked minutes because the API does not join operating hours.'}
            </Notice>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Booked minutes and booking counts per venue</caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Venue</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Booked hours</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Bookings</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Avg per booking</th>
                  </tr>
                </thead>
                <tbody>
                  {utilisation.slice(0, 10).map(row => (
                    <tr key={row.venueId} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.venueId}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950 tabular-nums">
                        {row.bookedHours.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatCount(row.bookings)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatDuration(row.avgMinutesPerBooking)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recent bookings"
          description="The eight most recently created bookings."
          actions={
            <Link to={PATHS.adminBookings} className="btn-secondary">
              All bookings
            </Link>
          }
        />

        {recent.isLoading ? (
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.isError ? (
          <ErrorState
            className="mt-5"
            message={toErrorMessage(recent.error, 'We could not load recent bookings.')}
            onRetry={() => void recent.refetch()}
          />
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <p className="mt-5 text-sm text-gray-600">No bookings have been created yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Most recently created bookings</caption>
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Starts</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Booking</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
                </tr>
              </thead>
              <tbody>
                {recent.data?.items.map(booking => (
                  <tr key={booking.publicReference} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <Link
                        to={`${PATHS.adminBookings}?reference=${encodeURIComponent(booking.publicReference)}`}
                        className="font-mono text-xs font-semibold text-primary-700 hover:underline"
                      >
                        {booking.publicReference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(booking.startAt)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatMoney(booking.amountMinor, booking.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={BOOKING_STATUS_TONE[booking.status]}>
                        {bookingStatusLabel(booking.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={PAYMENT_STATUS_TONE[booking.paymentStatus]}>
                        {paymentStatusLabel(booking.paymentStatus)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

interface MetricGridProps {
  metrics: AdminMetric[];
  isLoading: boolean;
}

const TONE_CLASS = {
  default: 'border-gray-200 bg-white',
  positive: 'border-emerald-200 bg-emerald-50',
  negative: 'border-amber-200 bg-amber-50',
} as const;

/**
 * Metric grid. `aria-live` is deliberately absent: these refresh on refetch, and
 * announcing every background update would talk over whatever the admin is doing.
 */
function MetricGrid({ metrics, isLoading }: MetricGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(metric => (
        <div key={metric.id} className={cn('rounded-xl border p-5', TONE_CLASS[metric.tone ?? 'default'])}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{metric.label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">{metric.value}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">{metric.hint}</p>
        </div>
      ))}
    </div>
  );
}