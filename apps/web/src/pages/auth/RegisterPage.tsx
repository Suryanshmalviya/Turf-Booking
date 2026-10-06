import { Link, useNavigate } from 'react-router-dom';

import { Container } from '../../components/common/Container';
import { RegisterForm } from '../../components/forms/RegisterForm';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';

export function RegisterPage() {
  useDocumentTitle('Create an account');
  const navigate = useNavigate();
  const { user, isBootstrapping } = useAuth();

  if (user && !isBootstrapping) {
    return null;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
      <Container size="narrow" className="w-full">
        <Card>
          <h1 className="text-2xl font-bold text-slate-950">Create your account</h1>
          <p className="mb-6 mt-1 text-sm text-gray-500">Start booking pickleball courts today</p>

          <RegisterForm onSuccess={() => navigate(ROUTES.home)} />

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to={ROUTES.login} className="font-medium text-primary-700 hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </Container>
    </div>
  );
}
