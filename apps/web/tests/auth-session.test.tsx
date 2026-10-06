import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../src/context/AuthProvider';
import { useAuth } from '../src/hooks/useAuth';
import { apiClient, resetApiClientState } from '../src/services/api-client';
import type { AuthUser } from '../src/types/auth';
import { renderWithProviders } from './helpers/render';

/**
 * Session behaviour end to end through the provider: bootstrapping, signing in,
 * signing out, and what happens to the cache when a refresh can no longer restore
 * the session. Only `fetch` is faked, so the real api-client, query cache and
 * context are all exercised.
 */

const customer: AuthUser = {
  id: 'user-1',
  email: 'player@example.com',
  displayName: 'Player One',
  role: 'customer',
  status: 'active',
  emailVerified: true,
};

interface Route {
  status: number;
  body?: unknown;
}

/** Serves the queued routes in order; anything unexpected answers `data: null`. */
function respondWith(...routes: Route[]) {
  const queue = [...routes];

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const next = queue.shift() ?? { status: 200, body: { success: true, data: null } };
      return {
        status: next.status,
        ok: next.status >= 200 && next.status < 300,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify(next.body ?? { success: false, error: { message: 'Failed' } }),
      };
    })
  );
}

const ok = (data: unknown): Route => ({ status: 200, body: { success: true, data } });
const unauthorized: Route = {
  status: 401,
  body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
};
const serverError: Route = {
  status: 500,
  body: { success: false, error: { code: 'INTERNAL', message: 'Boom' } },
};

/** Seeds a cache entry standing in for "the previous visitor's data". */
function CachedBookings() {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setQueryData(['bookings', 'list'], 'stale-bookings');
  }, [queryClient]);

  return null;
}

/** Surfaces the context so assertions can be made against what consumers see. */
function AuthProbe() {
  const { user, isBootstrapping, isSessionUnresolved, login, logout, retrySession } = useAuth();

  return (
    <div>
      <p data-testid="state">
        {isBootstrapping ? 'bootstrapping' : isSessionUnresolved ? 'unresolved' : 'resolved'}
      </p>
      <p data-testid="user">{user ? user.email : 'anonymous'}</p>

      <button onClick={() => void login({ email: customer.email, password: 'Str0ngPassphrase' })}>
        sign in
      </button>
      <button onClick={() => void logout()}>sign out</button>
      <button onClick={retrySession}>retry</button>
      <CachedBookings />
    </div>
  );
}

/** Local harness so the cache state under test can be asserted directly. */
let testClient: QueryClient | undefined;

function ProbeHarness({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const created = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    testClient = created;
    return created;
  });

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const staleBookings = () => testClient?.getQueryData(['bookings', 'list']);

const expectEvicted = async () => waitFor(() => expect(staleBookings()).toBeUndefined());

const expectState = async (state: string) =>
  waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent(state));

const expectUser = async (label: string) =>
  waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent(label));

beforeEach(() => {
  resetApiClientState();
  testClient = undefined;
  vi.unstubAllGlobals();
});

describe('session bootstrap', () => {
  it('waits for the check, then resolves a signed-in visitor', async () => {
    respondWith(ok({ user: customer }));

    renderWithProviders(<AuthProbe />);

    expect(screen.getByTestId('state')).toHaveTextContent('bootstrapping');
    await expectUser(customer.email);
    await expectState('resolved');
  });

  it('resolves an anonymous visitor without treating the 401 as an error', async () => {
    respondWith(unauthorized, unauthorized);

    renderWithProviders(<AuthProbe />);

    await expectUser('anonymous');
    await expectState('resolved');
  });

  it('reports an unreachable session check instead of claiming to be signed out', async () => {
    respondWith(serverError, serverError);

    renderWithProviders(<AuthProbe />);

    await expectState('unresolved');
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous');
  });

  it('re-runs the session check on retry', async () => {
    respondWith(serverError, serverError);
    renderWithProviders(<AuthProbe />);
    await expectState('unresolved');

    respondWith(ok({ user: customer }));
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));

    await expectUser(customer.email);
    await expectState('resolved');
  });
});

describe('signing in', () => {
  it('publishes the returned user to every consumer', async () => {
    respondWith(ok({ user: customer }), ok({ user: customer }));

    renderWithProviders(<AuthProbe />);
    await expectUser('anonymous');

    fireEvent.click(screen.getByRole('button', { name: 'sign in' }));

    await expectUser(customer.email);
  });

  it('evicts the previous visitor cached queries', async () => {
    respondWith(ok({ user: customer }), ok({ user: customer }));

    render(
      <ProbeHarness>
        <AuthProbe />
      </ProbeHarness>
    );
    await expectUser('anonymous');

    fireEvent.click(screen.getByRole('button', { name: 'sign in' }));

    await expectUser(customer.email);
    await expectEvicted();
  });
});

describe('signing out', () => {
  it('clears the cache and returns to anonymous', async () => {
    respondWith(ok({ user: customer }), { status: 204 });

    render(
      <ProbeHarness>
        <AuthProbe />
      </ProbeHarness>
    );
    await expectUser(customer.email);

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));

    await expectUser('anonymous');
    await expectEvicted();
  });

  it('still signs the browser out when the server call fails', async () => {
    respondWith(ok({ user: customer }), serverError);

    renderWithProviders(<AuthProbe />);
    await expectUser(customer.email);

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));

    await expectUser('anonymous');
  });
});

describe('unrecoverable session', () => {
  it('drops cached data when a refresh can no longer restore the session', async () => {
    // Bootstrap succeeds, then a cached read 401s and the refresh is rejected too.
    respondWith(ok({ user: customer }), unauthorized, unauthorized);

    function ExpiringRead() {
      return (
        <button
          onClick={() => {
            // A read through the api-client that comes back 401 once the access
            // token has expired, so the client tries to refresh before failing.
            void apiClient.get('/venues').catch(() => undefined);
          }}
        >
          refetch
        </button>
      );
    }

    render(
      <ProbeHarness>
        <AuthProbe />
        <ExpiringRead />
      </ProbeHarness>
    );
    await expectUser(customer.email);

    // Force a request that the api-client will answer with the queued 401.
    fireEvent.click(screen.getByRole('button', { name: 'refetch' }));

    await expectUser('anonymous');
    await expectEvicted();
  });
});
