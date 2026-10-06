import { AuthProvider } from './context/AuthProvider';
import { QueryProvider } from './context/QueryProvider';
import { ToastProvider } from './context/ToastProvider';
import { AppRoutes } from './routes/AppRoutes';

/**
 * Composition root. Providers are ordered from broadest to narrowest:
 * query cache, then session, then transient notifications.
 */
function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
