import { useState } from 'react';

import { FilterBar } from '../../components/admin/FilterBar';
import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { BarChartCard, ChartCard, PieChartCard } from '../../components/ui/Chart';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Loading';
import { useAdminReport, useDatabaseStatus } from '../../hooks/useAdmin';
import {
  bookingStatusMix,
  revenueByCurrency,
  summariseCancellations,
  summariseRevenue,
  totalBookings,
  utilisationChartData,
  utilisationRows,
} from '../../utils/adminMetrics';
import { toErrorMessage } from '../../utils/error';
import { formatCount, formatDateTime, formatMoney, todayIso } from '../../utils/format';

const RANGE_PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
] as const;

/** Start of the day `daysAgo` days back, in local time. */
function startOfDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString();
}

/**
 * Reporting over a chosen window.
 *
 * The API aggregates on `startAt`, so the window is expressed as instants rather
 * than calendar dates and the "from" side is anchored to local midnight. Every
 * figure carries the server's own definition text, because several of these
 * aggregates deliberately stop short of a derived percentage.
 */
export function AdminReportsPage() {
  const [range, setRange] = useState({ from: startOfDaysAgo(30).slice(0, 10), to: todayIso() });
  const [preset, setPreset] = useState<string>('30');

  const from = new Date(`${range.from}T00:00:00`).toISOString();
  const to = new Date(`${range.to}T23:59:59`).toISOString();

  const report = useAdminReport(from, to, range.from !== '' && range.to !== '');
  const database = useDatabaseStatus(true);

  const applyPreset = (id: string) => {
    const match = RANGE_PRESETS.find(entry => entry.id === id);
    if (!match) return;
    setPreset(id);
    setRange({ from: startOfDaysAgo(match.days).slice(0, 10), to: todayIso() });
  };

  const data = report.data;
  const revenue = summariseRevenue(data);
  const cancellations = summariseCancellations(data);
  const utilisation = utilisationRows(data);
  const statusMix = bookingStatusMix(data);
  const revenueRows = revenueByCurrency(data);
  const total = totalBookings(data);

  return (
    <div className="space-y-6">
      <Card>
        <FilterBar
          dateRange={{
            value: range,
            onChange: next => {
              setRange(next);
              setPreset('');
            },
          }}
          onReset={() => applyPreset('30')}
        >
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => applyPreset(option.id)}
                aria-pressed={preset === option.id}
                className={
                  preset === option.id
                    ? 'rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white'
                    : 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterBar>
      </Card>

      {report.isError ? (
        <ErrorState
          message={toErrorMessage(report.error, 'The report could not be built.')}
          onRetry={() => void report.refetch()}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStat
          label="Bookings in range"
          value={report.isLoading ? '—' : formatCount(total)}
          hint={data?.definitions.bookingCounts}
        />
        <ReportStat
          label="Gross revenue"
          value={
            report.isLoading ? '—' : revenue ? formatMoney(revenue.grossMinor, revenue.currency) : '—'
          }
          hint={data?.definitions.grossBookingValue}
          {...(revenue?.mixed ? { tone: 'warning' as const } : {})}
        />
        <ReportStat
          label="Refunded"
          value={
            report.isLoading ? '—' : revenue ? formatMoney(revenue.refundedMinor, revenue.currency) : '—'
          }
          hint={data?.definitions.refunds}
        />
        <ReportStat
          label="Cancellation rate"
          value={report.isLoading ? '—' : `${cancellations.ratePercent}%`}
          hint={`${formatCount(cancellations.cancelled)} of ${formatCount(total)} bookings. ${
            data?.definitions.cancellations ?? ''
          }`}
          {...(cancellations.ratePercent > 20 ? { tone: 'warning' as const } : {})}
        />
      </div>

      {revenue?.mixed && (
        <Notice variant="warning" title="Multiple currencies">
          Revenue is reported for {revenue.currency}, the largest by value. Also carrying value:{' '}
          {revenue.otherCurrencies.join(', ')}. Totals are not summed across currencies.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Bookings by status"
          description="Bookings whose start falls inside the window, grouped by status."
        >
          {report.isLoading ? (
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
          description="Confirmed and completed bookings, in major units."
        >
          {report.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <BarChartCard
              data={revenueRows}
              xKey="currency"
              series={[
                { dataKey: 'gross', name: 'Gross revenue' },
                { dataKey: 'bookings', name: 'Bookings' },
              ]}
              valueFormatter={value => value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Court utilisation"
        description="Booked hours per court venue. Hours rather than a percentage, because the API does not join configured operating minutes."
      >
        {report.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <BarChartCard
            data={utilisationChartData(data, venueId => venueId.slice(-6))}
            xKey="venue"
            series={[{ dataKey: 'hours', name: 'Booked hours' }]}
            layout="vertical"
            height={Math.max(220, Math.min(utilisation.length, 12) * 34)}
            valueFormatter={value => `${value.toLocaleString()} h`}
          />
        )}
      </ChartCard>

      <Card>
        <CardHeader
          title="User and platform volume"
          description="Account totals come from the database health endpoint and cover all history, not the selected window."
        />

        {database.isLoading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
              ))}
          </div>
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Volume label="Users" value={database.data?.counts.users} />
            <Volume label="Court venues" value={database.data?.counts.venues} />
            <Volume label="Individual courts" value={database.data?.counts.pitches} />
            <Volume label="Bookings (all time)" value={database.data?.counts.bookings} />
            <Volume label="Payment attempts" value={database.data?.counts.paymentAttempts} />
            <Volume label="Refunds" value={database.data?.counts.refunds} />
            <Volume label="Reviews" value={database.data?.counts.reviews} />
            <Volume label="Audit entries" value={database.data?.counts.auditLogs} />
          </dl>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Venue rating averages"
          description="Published reviews only, across all history."
        />

        {report.isLoading ? (
          <Skeleton className="mt-5 h-24 w-full" />
        ) : (data?.reviewAverages.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-gray-600">No published reviews yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data?.reviewAverages.map(row => (
              <li
                key={row._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
              >
                <span className="font-mono text-xs text-gray-500">{row._id.slice(-8)}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={row.average >= 4 ? 'success' : row.average >= 3 ? 'warning' : 'danger'}>
                    {row.average.toFixed(1)}
                  </Badge>
                  <span className="text-xs text-gray-500">{formatCount(row.count)} reviews</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Definitions" description="Exactly how the server computes each figure." />
        <dl className="mt-4 space-y-3">
          {Object.entries(data?.definitions ?? {}).map(([key, definition]) => (
            <div key={key}>
              <dt className="text-sm font-semibold text-slate-950">{key}</dt>
              <dd className="text-sm text-gray-600">{definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-gray-400">Report generated {formatDateTime(new Date().toISOString())}.</p>
      </Card>
    </div>
  );
}

interface ReportStatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning';
}

function ReportStat({ label, value, hint, tone }: ReportStatProps) {
  return (
    <div className={`rounded-xl border p-5 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Volume({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-slate-950 tabular-nums">{formatCount(value ?? 0)}</dd>
    </div>
  );
}