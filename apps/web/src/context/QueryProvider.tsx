import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { ApiError, isRetryable } from '../utils/error';

/**
 * One client per browser session. Created lazily inside state so React strict
 * mode's double render does not throw away a populated cache.
 */

/** Exponential backoff, capped, so a struggling backend is not hammered. */
function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

/**
 * 4xx answers are the server's final word: replaying a 400 or a 403 changes
 * nothing. Network failures and 5xx answers are worth another attempt, and so is
 * a 429 — the API tells us how long to wait through `retry-after`.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isRetryable(error)) return false;

  const retryAfter = error instanceof ApiError ? readRetryAfter(error) : undefined;
  return retryAfter === undefined || failureCount === 0;
}

function readRetryAfter(error: ApiError): number | undefined {
  const details = error.details as { retryAfterSeconds?: number } | undefined;
  return typeof details?.retryAfterSeconds === 'number' ? details.retryAfterSeconds : undefined;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        retryDelay,
      },
      mutations: {
        // A mutation is usually a user action; replaying it silently would be
        // surprising, so failures surface and the user decides.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
