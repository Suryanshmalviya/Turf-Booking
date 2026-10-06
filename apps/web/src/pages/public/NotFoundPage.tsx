import { Link } from 'react-router-dom';

import { Container, PageShell } from '../../components/common/Container';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROUTES } from '../../routes/paths';

export function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <PageShell tone="plain">
      <Container size="narrow" className="py-20 text-center">
        <p className="text-7xl font-bold text-primary-600">404</p>
        <h1 className="mt-4 text-3xl font-bold text-slate-950">Page Not Found</h1>
        <p className="mx-auto mt-3 max-w-md text-gray-600">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to={ROUTES.home} className="btn-primary mt-8">
          Go Home
        </Link>
      </Container>
    </PageShell>
  );
}
