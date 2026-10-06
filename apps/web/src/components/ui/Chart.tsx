import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '../../utils/cn';
import { Card, CardHeader } from './Card';
import { EmptyState } from './EmptyState';

/**
 * Shared palette. Charts stay on the same colours as the rest of the console so
 * a series means the same thing wherever it appears.
 */
export const CHART_COLORS = [
  '#0f766e',
  '#b45309',
  '#4338ca',
  '#be123c',
  '#0f172a',
  '#65a30d',
] as const;

export interface SeriesConfig {
  dataKey: string;
  name: string;
  /** Renders a smooth line instead of bars. Only honoured by `line` charts. */
  smooth?: boolean;
}

/**
 * Props shared by every chart kind. Data is passed through untouched so callers
 * keep full control over labels and values.
 */
interface BaseChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  /** Colours to use when `series` is longer than the palette. */
  colors?: readonly string[];
  className?: string;
}

export interface BarChartProps extends BaseChartProps {
  layout?: 'horizontal' | 'vertical';
  /** Formats the value axis and tooltips, e.g. currency minor → major. */
  valueFormatter?: (value: number) => string;
}

export interface LineChartProps extends BaseChartProps {
  valueFormatter?: (value: number) => string;
}

export interface PieChartProps extends BaseChartProps {
  /** Label for each slice; the value is read from `series[0].dataKey`. */
  nameKey?: string;
  /** Formats slice values in the tooltip and legend, e.g. a share percentage. */
  valueFormatter?: (value: number) => string;
}

/** Shared tooltip, so hovering reads identically across every chart. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-semibold text-slate-950">{label}</p>}
      {payload.map(entry => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-gray-700">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.name}: {entry.value !== undefined ? formatValue(entry.value, valueFormatter) : '—'}
        </p>
      ))}
    </div>
  );
}

function formatValue(value: number, formatter?: (value: number) => string): string {
  if (!Number.isFinite(value)) return '—';
  return formatter ? formatter(value) : value.toLocaleString();
}

function LegendRow({ series, colors }: { series: SeriesConfig[]; colors: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((entry, index) => (
        <li key={entry.dataKey} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: colors[index % colors.length] }}
          />
          {entry.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Vertical bar chart. Used for revenue-per-currency, bookings-per-status and
 * other discrete comparisons.
 */
export function BarChartCard({
  data,
  xKey,
  series,
  height = 280,
  colors = CHART_COLORS,
  layout = 'horizontal',
  valueFormatter,
  className,
}: BarChartProps) {
  if (data.length === 0) return <ChartEmpty />;

  const isVertical = layout === 'vertical';
  const categoryAxis = { dataKey: xKey, tick: { fontSize: 12 }, tickLine: false };
  const valueAxis = {
    tick: { fontSize: 12 },
    tickLine: false,
    axisLine: false,
    tickFormatter: valueFormatter,
  };

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={isVertical ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={!isVertical} />
          {isVertical ? (
            <>
              <XAxis type="number" {...valueAxis} />
              <YAxis type="category" width={120} {...categoryAxis} />
            </>
          ) : (
            <>
              <XAxis {...categoryAxis} />
              <YAxis {...valueAxis} />
            </>
          )}
          <Tooltip
            content={<ChartTooltip valueFormatter={valueFormatter} />}
            cursor={{ fill: '#f3f4f6' }}
          />
          <Legend content={() => null} />
          {series.map((entry, index) => (
            <Bar
              key={entry.dataKey}
              dataKey={entry.dataKey}
              name={entry.name}
              fill={colors[index % colors.length]}
              radius={[6, 6, 0, 0]}
              maxBarSize={56}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <LegendRow series={series} colors={colors} />
    </div>
  );
}

/** Trend line chart, used for report series over a date window. */
export function LineChartCard({
  data,
  xKey,
  series,
  height = 280,
  colors = CHART_COLORS,
  valueFormatter,
  className,
}: LineChartProps) {
  if (data.length === 0) return <ChartEmpty />;

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
          <Legend content={() => null} />
          {series.map((entry, index) => (
            <Line
              key={entry.dataKey}
              type="monotone"
              dataKey={entry.dataKey}
              name={entry.name}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <LegendRow series={series} colors={colors} />
    </div>
  );
}

/** Pie chart for share-of-total breakdowns such as booking status mix. */
export function PieChartCard({
  data,
  nameKey = 'name',
  series,
  height = 280,
  colors = CHART_COLORS,
  className,
  valueFormatter,
}: PieChartProps) {
  if (data.length === 0) return <ChartEmpty />;

  const only = series[0];

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
          <Legend content={() => null} />
          <Pie
            data={data}
            dataKey={only.dataKey}
            nameKey={nameKey}
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={String(entry[nameKey])} fill={colors[index % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-4 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {data.map((entry, index) => (
          <li
            key={String(entry[nameKey])}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex items-center gap-1.5 text-gray-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colors[index % colors.length] }}
              />
              {String(entry[nameKey])}
            </span>
            <span className="font-semibold text-slate-950 tabular-nums">
              {formatValue(Number(entry[only.dataKey]), valueFormatter)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ChartCardProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Titled frame every chart in the console sits in. */
export function ChartCard({ title, description, actions, children, className }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        {...(description ? { description } : {})}
        {...(actions ? { actions } : {})}
      />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function ChartEmpty() {
  return (
    <EmptyState
      title="No data in this range"
      description="Widen the date range or clear the filters."
    />
  );
}
