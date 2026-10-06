import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider } from '../../src/context/AuthProvider';
import { ToastProvider } from '../../src/context/ToastProvider';

/**
 * A query client with retries and background refetching disabled so assertions
 * are not racing the network layer.
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

/** Render a component inside the router, query and auth providers. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: ProviderOptions = {}
): RenderResult {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
