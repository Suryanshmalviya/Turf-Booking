import type { ReactNode } from 'react';

import { toErrorMessage, toErrorTitle } from '../../utils/error';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Loading } from '../ui/Loading';

/**
 * The four states every remote read has, in one place: loading, error (with a
 * retry that re-runs the query), empty, and content.
 *
 * The shape is the shape TanStack Query returns, so any query result can be
 * passed straight in and a page never has to re-implement the branch ladder.
 */

export interface QueryState {
  isPending: boolean;
  isError: boolean;
  isFetching?: boolean;
  error?: unknown;
  refetch?: () => unknown;
  data?: unknown;
}

export interface AsyncBoundaryProps {
  query: QueryState;
  children: ReactNode;
  /** Decide whether a successful response has nothing to show. */
  isEmpty?: (data: unknown) => boolean;
  /** Copy for the empty state. Omit to skip the empty branch entirely. */
  empty?: {
    title: string;
    description?: string;
    action?: ReactNode;
  };
  loadingMessage?: string;
  loadingFullHeight?: boolean;
  errorTitle?: string;
  /** Rendered above the content while a background refetch is in flight. */
  isStale?: boolean;
}

export function AsyncBoundary({
  query,
  children,
  isEmpty,
  empty,
  loadingMessage,
  loadingFullHeight,
  errorTitle,
  isStale,
}: AsyncBoundaryProps) {
  // `isPending` alone is also true for a disabled query, so an error that has
  // already been observed has to win over the initial pending state.
  if (query.isError) {
    return (
      <ErrorState
        title={errorTitle ?? toErrorTitle(query.error)}
        message={toErrorMessage(query.error)}
        {...(query.refetch ? { onRetry: () => void query.refetch?.() } : {})}
      />
    );
  }

  if (query.isPending) {
    return (
      <Loading
        {...(loadingMessage ? { message: loadingMessage } : {})}
        fullHeight={loadingFullHeight}
      />
    );
  }

  if (empty && isEmpty?.(query.data)) {
    return <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  }

  return (
    <>
      {isStale && query.isFetching && (
        <div role="status" aria-live="polite" className="sr-only">
          Updating
        </div>
      )}
      {children}
    </>
  );
}
