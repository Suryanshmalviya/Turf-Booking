import { useState } from 'react';

import { ConfirmActionDialog } from '../../components/admin/ConfirmActionDialog';
import { DataTable } from '../../components/admin/DataTable';
import { FilterBar } from '../../components/admin/FilterBar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useAdminUsers, useUpdateUser } from '../../hooks/useAdmin';
import { useToast } from '../../hooks/useToast';
import type { AdminUser, AdminUserRole, AdminUserStatus } from '../../types/admin';
import {
  ADMIN_PAGE_SIZE,
  humanize,
  USER_ROLES,
  USER_STATUS_TONE,
  USER_STATUSES,
} from '../../types/admin';
import type { TableColumn } from '../../types/ui';
import { toErrorMessage } from '../../utils/error';
import { formatDateTime, formatRelative } from '../../utils/format';

const ALL_STATUS: AdminUserStatus | '' = '';

const ROLE_OPTIONS = [
  { value: '', label: 'Any role' },
  ...USER_ROLES.map(role => ({ value: role, label: humanize(role) })),
];

/**
 * User administration.
 *
 * Search and status filtering are server-side (`/admin/users` takes `q` and
 * `status`), so filtering does not degrade as the account table grows.
 */
export function AdminUsersPage() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminUserRole | ''>('');
  const [status, setStatus] = useState<AdminUserStatus | ''>(ALL_STATUS);
  const [pending, setPending] = useState<{ user: AdminUser; next: AdminUserStatus }>();

  const query = { page, ...(search ? { q: search } : {}), ...(status ? { status } : {}) };
  const users = useAdminUsers(query);

  const updateUser = useUpdateUser();

  const reset = () => {
    setPage(1);
    setSearch('');
    setRole('');
    setStatus(ALL_STATUS);
  };

  const rows = (users.data?.items ?? []).filter(user => (role ? user.role === role : true));

  const applyStatus = () => {
    if (!pending) return;
    const { user, next } = pending;

    updateUser.mutate(
      { userId: user._id ?? user.email, status: next },
      {
        onSuccess: result => {
          setPending(undefined);
          toast.success('Account updated', `${result.email} is now ${humanize(next)}.`);
        },
        onError: (cause: unknown) =>
          toast.error('Update failed', toErrorMessage(cause, 'The account could not be updated.')),
      }
    );
  };

  const columns: Array<TableColumn<AdminUser>> = [
    {
      key: 'user',
      header: 'User',
      render: user => (
        <div>
          <p className="font-semibold text-slate-950">{user.displayName}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: user => <span className="text-sm">{humanize(user.role)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: user => <Badge tone={USER_STATUS_TONE[user.status]}>{humanize(user.status)}</Badge>,
    },
    {
      key: 'joined',
      header: 'Joined',
      render: user => (
        <span className="text-xs text-gray-500">{formatDateTime(user.createdAt ?? '')}</span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      render: user =>
        user.lastLoginAt ? (
          <span className="text-xs text-gray-500" title={formatDateTime(user.lastLoginAt)}>
            {formatRelative(user.lastLoginAt)}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Never</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: user => (
        <div className="flex justify-end gap-2">
          <Select
            label={`Change status for ${user.displayName}`}
            hideLabel
            className="w-32"
            value={user.status}
            options={USER_STATUSES.map(option => ({ value: option, label: humanize(option) }))}
            disabled={updateUser.isPending}
            onChange={event =>
              setPending({
                user,
                next: event.target.value as AdminUserStatus,
              })
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption="Platform user accounts"
        columns={columns}
        rows={rows}
        rowKey={user => user._id ?? user.email}
        isLoading={users.isLoading}
        isError={users.isError}
        {...(users.isError ? { errorMessage: toErrorMessage(users.error) } : {})}
        {...(users.isError ? { onRetry: () => void users.refetch() } : {})}
        emptyTitle="No accounts match"
        emptyDescription="Try a different search term or clear the filters."
        emptyAction={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
        toolbar={
          <FilterBar
            search={{
              value: search,
              onChange: value => {
                setSearch(value);
                setPage(1);
              },
              placeholder: 'Search name or email…',
            }}
            filters={[
              { name: 'role', label: 'Role', options: ROLE_OPTIONS, hideLabel: true },
              {
                name: 'status',
                label: 'Status',
                hideLabel: true,
                options: [
                  { value: '', label: 'Any status' },
                  ...USER_STATUSES.map(option => ({ value: option, label: humanize(option) })),
                ],
              },
            ]}
            values={{ role, status }}
            onFilterChange={(name, value) => {
              if (name === 'role') setRole(value as AdminUserRole | '');
              if (name === 'status') setStatus(value as AdminUserStatus | '');
              setPage(1);
            }}
            onReset={reset}
          />
        }
        pagination={{
          page: users.data?.page ?? page,
          limit: users.data?.limit ?? ADMIN_PAGE_SIZE,
          total: users.data?.total ?? 0,
          onPageChange: setPage,
        }}
        itemLabel="user"
      />

      <ConfirmActionDialog
        open={Boolean(pending)}
        title="Change account status?"
        description={
          pending ? (
            <>
              {pending.user.displayName} ({pending.user.email}) will become{' '}
              <strong>{humanize(pending.next)}</strong>. Suspending or deleting an account also
              revokes its active sessions.
            </>
          ) : undefined
        }
        confirmLabel="Apply change"
        confirmVariant={pending?.next === 'deleted' ? 'danger' : 'primary'}
        isPending={updateUser.isPending}
        onClose={() => setPending(undefined)}
        onConfirm={applyStatus}
      />
    </div>
  );
}
