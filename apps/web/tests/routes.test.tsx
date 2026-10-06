import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminRoute } from '../src/routes/AdminRoute';
import { ProtectedRoute } from '../src/routes/ProtectedRoute';
import type { AuthUser } from '../src/types/auth';
import { renderWithProviders } from './helpers/render';

const authApi = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('../src/services/auth.api', () => ({ authApi }));

const customer: AuthUser = {
  id: 'user-1',
  email: 'player@example.com',
  displayName: 'Player One',
  role: 'customer',
  status: 'active',
};

const admin: AuthUser = { ...customer, id: 'admin-1', displayName: 'Root', role: 'admin' };

const loginRoute = <Route path="/login" element={<p>Login page</p>} />;

describe('ProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects a signed-out visitor to the login page', async () => {
    authApi.me.mockResolvedValue(null);

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/bookings" element={<p>Protected content</p>} />
        </Route>
        {loginRoute}
      </Routes>,
      { route: '/bookings' }
    );

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders protected content for a signed-in customer', async () => {
    authApi.me.mockResolvedValue(customer);

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/bookings" element={<p>Protected content</p>} />
        </Route>
        {loginRoute}
      </Routes>,
      { route: '/bookings' }
    );

    expect(await screen.findByText('Protected content')).toBeInTheDocument();
  });
});

describe('AdminRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a signed-in customer away from the admin console', async () => {
    authApi.me.mockResolvedValue(customer);

    renderWithProviders(
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<p>Admin content</p>} />
        </Route>
        <Route path="/bookings" element={<p>Bookings page</p>} />
      </Routes>,
      { route: '/admin' }
    );

    expect(await screen.findByText('Bookings page')).toBeInTheDocument();
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
  });

  it('renders the console for an administrator', async () => {
    authApi.me.mockResolvedValue(admin);

    renderWithProviders(
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<p>Admin content</p>} />
        </Route>
        {loginRoute}
      </Routes>,
      { route: '/admin' }
    );

    expect(await screen.findByText('Admin content')).toBeInTheDocument();
  });
});