import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ErrorState } from '../components/ui/ErrorState';
import { Loading } from '../components/ui/Loading';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from './paths';

/**
 * Gate for pages that require a signed-in customer.
 *
 * While the session check is in flight nothing is redirected, otherwise a hard
 * refresh on a protected page would bounce the user to the login screen before
 * the cookie has had a chance to resolve. A *failed* check is also not a signed
 * out visitor — it is an unreachable API — so it gets a retry instead of a
 * redirect that would discard a perfectly valid session.
 */
export function ProtectedRoute() {
  const { user, isBootstrapping, isSessionUnresolved, retrySession } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <Loading message="Checking your session…" fullHeight />;
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

  return <Outlet />;
}