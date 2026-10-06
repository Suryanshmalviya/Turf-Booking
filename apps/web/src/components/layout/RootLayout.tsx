import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../routes/paths';
import { isAdminRole } from '../../types/auth';
import { Container } from '../common/Container';
import { Button } from '../ui/Button';

const NAV_LINKS = [
  { to: ROUTES.home, label: 'Home' },
  { to: ROUTES.venues, label: 'Venues' },
];

/**
 * Application shell: sticky header, routed content and the site footer.
 * Rendered as the layout route element so every page shares it.
 */
export function RootLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Collapse the mobile menu whenever navigation happens.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await logout();
    } finally {
      // Always leave the account area, even if the request failed.
      navigate(ROUTES.login, { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <Container size="wide">
          <div className="flex h-16 items-center justify-between">
            <Link to={ROUTES.home} className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt=""
                className="h-9 w-auto rounded-lg object-contain shadow-sm"
              />
              <span className="text-lg font-bold text-gray-900">Pickleball Booking</span>
            </Link>

            <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
              {NAV_LINKS.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    isActive
                      ? 'text-primary-700 font-semibold'
                      : 'font-medium text-gray-600 hover:text-gray-900'
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <AccountActions
                displayName={user?.displayName}
                isAdmin={isAdminRole(user?.role)}
                onLogout={handleLogout}
              />
            </nav>

            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMenuOpen(open => !open)}
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {menuOpen ? '×' : '≡'}
              </span>
            </Button>
          </div>
        </Container>

        {menuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-gray-100 bg-white shadow-lg md:hidden"
          >
            <Container size="wide" className="space-y-2 py-4">
              {NAV_LINKS.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  {link.label}
                </NavLink>
              ))}
              <MobileAccountActions
                displayName={user?.displayName}
                isAdmin={isAdminRole(user?.role)}
                onLogout={handleLogout}
              />
            </Container>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}

interface AccountActionsProps {
  displayName: string | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}

function AccountActions({ displayName, isAdmin, onLogout }: AccountActionsProps) {
  if (!displayName) {
    return (
      <div className="flex items-center gap-3">
        <Link to={ROUTES.login} className="btn-secondary text-sm">
          Sign in
        </Link>
        <Link to={ROUTES.register} className="btn-primary text-sm">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link to={ROUTES.bookings} className="font-medium text-gray-600 hover:text-gray-900">
        My bookings
      </Link>
      {isAdmin && (
        <Link
          to={ROUTES.admin}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
        >
          Admin
        </Link>
      )}
      <span className="text-sm font-medium text-slate-700">{displayName}</span>
      <Button variant="secondary" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}

function MobileAccountActions({ displayName, isAdmin, onLogout }: AccountActionsProps) {
  if (!displayName) {
    return (
      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        <Link to={ROUTES.login} className="btn-secondary w-full py-2 text-center text-sm">
          Sign in
        </Link>
        <Link to={ROUTES.register} className="btn-primary w-full py-2 text-center text-sm">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <span className="truncate font-medium text-slate-700">{displayName}</span>
      </div>
      <Link
        to={ROUTES.bookings}
        className="rounded-lg px-3 py-2 text-base font-medium text-gray-700"
      >
        My bookings
      </Link>
      {isAdmin && (
        <Link
          to={ROUTES.admin}
          className="rounded-lg px-3 py-2 text-base font-semibold text-amber-600"
        >
          Admin panel
        </Link>
      )}
      <Button variant="secondary" size="sm" className="w-full" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <Container size="wide" className="py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Pickleball Booking</h3>
            <p className="text-gray-600">
              Book pickleball courts easily and securely. Find your perfect court today.
            </p>
          </div>
          <div>
            <h4 className="mb-4 font-medium text-gray-900">Quick links</h4>
            <Link to={ROUTES.venues} className="text-gray-600 hover:text-primary-600">
              Browse venues
            </Link>
          </div>
          <div>
            <h4 className="mb-4 font-medium text-gray-900">Support</h4>
            <p className="text-sm text-gray-500">Help center · Terms of service · Privacy policy</p>
          </div>
        </div>
        <p className="mt-8 border-t border-gray-200 pt-8 text-center text-gray-500">
          &copy; {new Date().getFullYear()} Pickleball Booking. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
