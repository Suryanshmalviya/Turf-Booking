import { useState } from 'react';

import { ConfirmActionDialog } from '../../components/admin/ConfirmActionDialog';
import { DescriptionList } from '../../components/common/DescriptionList';
import { Notice } from '../../components/common/Feedback';
import { Badge } from '../../components/ui/Badge';
import { StatusDot } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useDatabaseStatus, useProcessNotifications, useSeedDatabase } from '../../hooks/useAdmin';
import { useToast } from '../../hooks/useToast';
import { toErrorMessage } from '../../utils/error';
import { formatCount, formatDateTime } from '../../utils/format';

/**
 * Operational settings.
 *
 * The API has no settings resource, so this section is limited to the platform
 * operations the server actually exposes: database health, demo-data seeding and
 * draining the notification outbox. Anything else — currency, hold duration,
 * provider keys, fee percentages — is configuration in the server environment,
 * and is listed as read-only reference rather than presented as an editable form
 * that would silently do nothing.
 */
export function AdminSettingsPage() {
  const toast = useToast();

  const database = useDatabaseStatus(true);
  const seed = useSeedDatabase();
  const processNotifications = useProcessNotifications();

  const [confirming, setConfirming] = useState<'seed' | 'notifications' | null>(null);

  const connected = database.data?.status === 'connected';

  const runSeed = () => {
    setConfirming(null);
    seed.mutate(undefined, {
      onSuccess: result =>
        toast.success('Demo data seeded', `Stored ${formatCount(result.seededCount)} sample courts.`),
      onError: (cause: unknown) => toast.error('Seeding failed', toErrorMessage(cause)),
    });
  };

  const runNotifications = () => {
    setConfirming(null);
    processNotifications.mutate(undefined, {
      onSuccess: () => {
        toast.success('Outbox processed', 'Pending notifications have been dispatched.');
        void database.refetch();
      },
      onError: (cause: unknown) => toast.error('Processing failed', toErrorMessage(cause)),
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Database"
          description="Live connection health and document counts."
          actions={
            <Button variant="secondary" onClick={() => void database.refetch()} loading={database.isFetching}>
              Refresh
            </Button>
          }
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <StatusDot
            tone={connected ? 'success' : 'danger'}
            label={connected ? 'Connected' : 'Disconnected'}
          />
          {database.data?.pingMs !== undefined && database.data.pingMs >= 0 && (
            <span className="text-sm text-gray-500">Ping {database.data.pingMs} ms</span>
          )}
        </div>

        <DescriptionList
          className="mt-4"
          items={[
            { label: 'Database', value: database.data?.databaseName ?? '—' },
            { label: 'Host', value: database.data?.host ?? '—' },
            {
              label: 'Checked',
              value: database.data ? formatDateTime(database.data.checkedAt) : '—',
            },
            ...(database.data
              ? (
                  Object.entries(database.data.counts) as Array<
                    [string, number | undefined]
                  >
                ).map(([collection, count]) => ({ label: collection, value: formatCount(count ?? 0) }))
              : []),
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="Platform operations"
          description="Actions that affect the whole platform. Both are rate-limited server-side."
        />

        <div className="mt-5 space-y-4">
          <ActionRow
            title="Seed demo courts"
            description="Creates two sample venues with courts, opening hours and pricing. Existing venues of the same name are skipped, so this is safe to run twice."
            actionLabel="Seed demo data"
            isPending={seed.isPending}
            onClick={() => setConfirming('seed')}
          />

          <ActionRow
            title="Process notification outbox"
            description="Dispatches queued emails. Limited to five requests per window by the API."
            actionLabel="Process now"
            isPending={processNotifications.isPending}
            onClick={() => setConfirming('notifications')}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Environment configuration"
          description="Set on the server. Read-only here — changing them requires a deployment, so they are shown for reference rather than as an editable form."
        />

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Server-side settings and where they come from</caption>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Setting</th>
                <th scope="col" className="px-4 py-3 font-semibold">Source</th>
                <th scope="col" className="px-4 py-3 font-semibold">Effect</th>
              </tr>
            </thead>
            <tbody>
              {SERVER_SETTINGS.map(setting => (
                <tr key={setting.name} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-slate-950">
                    <code className="text-xs">{setting.name}</code>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{setting.source}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{setting.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Notice variant="info" className="mt-5">
          These values are not editable from the console. Doing so would imply a persistence layer the API
          does not have, and a form that appeared to save would be worse than none.
        </Notice>
      </Card>

      <ConfirmActionDialog
        open={confirming === 'seed'}
        title="Seed demo courts?"
        description="This inserts sample venues, courts, opening hours and price rules into the live database."
        confirmLabel="Seed now"
        isPending={seed.isPending}
        onClose={() => setConfirming(null)}
        onConfirm={runSeed}
      />

      <ConfirmActionDialog
        open={confirming === 'notifications'}
        title="Process the notification outbox?"
        description="Queued emails will be dispatched immediately."
        confirmLabel="Process now"
        isPending={processNotifications.isPending}
        onClose={() => setConfirming(null)}
        onConfirm={runNotifications}
      />
    </div>
  );
}

interface ActionRowProps {
  title: string;
  description: string;
  actionLabel: string;
  isPending: boolean;
  onClick: () => void;
}

function ActionRow({ title, description, actionLabel, isPending, onClick }: ActionRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
      <div className="min-w-0">
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <Button variant="secondary" onClick={onClick} disabled={isPending} className="shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}

interface ServerSetting {
  name: string;
  source: string;
  effect: string;
}

/** Mirrors the groups in `apps/api/src/config`. */
const SERVER_SETTINGS: ServerSetting[] = [
  {
    name: 'BOOKING_HOLD_MINUTES',
    source: 'Environment',
    effect: 'How long a payment hold reserves a slot before it lapses.',
  },
  {
    name: 'BOOKING_FREE_CANCEL_MINUTES',
    source: 'Environment',
    effect: 'Free-cancellation window before a booking starts, beyond which no refund is issued.',
  },
  {
    name: 'BOOKING_CANCELLATION_REFUND_PERCENT',
    source: 'Environment',
    effect: 'Percentage refunded when a cancellation falls inside the free window.',
  },
  {
    name: 'PAYMENT_PENDING_TIMEOUT_MINUTES',
    source: 'Environment',
    effect: 'After how long an unanswered payment attempt is flagged uncertain by reconciliation.',
  },
  {
    name: 'PAYMENT_PROVIDER',
    source: 'Environment',
    effect: 'Which payment adapter is used. Without one, attempts stay in the development mock and never settle.',
  },
  {
    name: 'CORS_ORIGINS',
    source: 'Environment',
    effect: 'Browser origins allowed to call the API.',
  },
];