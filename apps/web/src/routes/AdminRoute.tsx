import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ErrorState } from '../components/ui/ErrorState';
import { Loading } from '../components/ui/Loading';
import { useAuth } from '../hooks/useAuth';
import { isAdminRole } from '../types/auth';
import { ROUTES } from './paths';

/**
 * Gate for the administrative console. Non-admins are sent to their bookings
 * rather than the login screen so a signed-in customer is not asked to sign in
 * again just because they opened an admin URL. As with `ProtectedRoute`, a failed
 * session check is retried rather than treated as signed out.
 */
export function AdminRoute() {
  const { user, isBootstrapping, isSessionUnresolved, retrySession } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <Loading message="Verifying administrator credentials…" fullHeight />;
  }

  if (isSessionUnresolved) {
    return (
      <ErrorState
        title="We could not confirm your session"
        message="The server did not answer. Check your connection and try again."
        onRetry={retrySession}
        className="mx-auto mt-16 max-w-lg"
      />
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }

  if (!isAdminRole(user.role)) {
    return <Navigate to={ROUTES.bookings} replace />;
  }

  return <Outlet />;
}
