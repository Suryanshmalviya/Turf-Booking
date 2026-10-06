import { Link, useNavigate } from 'react-router-dom';

import { Container } from '../../components/common/Container';
import { LoginForm } from '../../components/forms/LoginForm';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';
import { isAdminRole } from '../../types/auth';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const { user, isBootstrapping } = useAuth();

  // A signed-in visitor has no reason to see the login form again.
  if (user && !isBootstrapping) {
    return null;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
      <Container size="narrow" className="w-full">
        <Card>
          <h1 className="text-2xl font-bold text-slate-950">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-gray-500">
            Sign in to your pickleball booking account
          </p>

          <LoginForm onSuccess={signedIn => navigate(isAdminRole(signedIn.role) ? ROUTES.admin : ROUTES.home)} />

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to={ROUTES.register} className="font-medium text-primary-700 hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </Container>
    </div>
  );
}