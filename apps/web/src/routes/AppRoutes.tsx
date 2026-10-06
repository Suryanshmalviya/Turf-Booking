import { lazy,Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '../components/admin/AdminLayout';
import { RootLayout } from '../components/layout/RootLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { HomePage } from '../pages/public/HomePage';
import { NotFoundPage } from '../pages/public/NotFoundPage';
import { VenueDetailPage } from '../pages/public/VenueDetailPage';
import { VenueSearchPage } from '../pages/public/VenueSearchPage';
import { BookingConfirmationPage } from '../pages/user/BookingConfirmationPage';
import { BookingDetailPage } from '../pages/user/BookingDetailPage';
import { BookingPage } from '../pages/user/BookingPage';
import { BookingsPage } from '../pages/user/BookingsPage';
import { CheckoutPage } from '../pages/user/CheckoutPage';
import { AdminRoute } from './AdminRoute';
import { PATHS, ROUTES } from './paths';
import { ProtectedRoute } from './ProtectedRoute';

/**
 * The console is a separate audience from the booking journey, and it is the
 * only thing that pulls in the charting library. Loading it on demand keeps that
 * weight out of the bundle every customer downloads.
 */
const AdminBookingsPage = lazy(() => import('../pages/admin/AdminBookingsPage').then(m => ({ default: m.AdminBookingsPage })));
const AdminCourtsPage = lazy(() => import('../pages/admin/AdminCourtsPage').then(m => ({ default: m.AdminCourtsPage })));
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const AdminPaymentsPage = lazy(() => import('../pages/admin/AdminPaymentsPage').then(m => ({ default: m.AdminPaymentsPage })));
const AdminReviewsPage = lazy(() => import('../pages/admin/AdminReviewsPage').then(m => ({ default: m.AdminReviewsPage })));
const AdminReportsPage = lazy(() => import('../pages/admin/AdminReportsPage').then(m => ({ default: m.AdminReportsPage })));
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));

/** Placeholder shown while a console section is being fetched. */
function AdminSectionFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500"
    >
      Loading section…
    </div>
  );
}

/**
 * Route table. Guards are expressed as layout routes so a whole branch can be
 * protected without repeating the check on every page.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        {/* Public */}
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.register} element={<RegisterPage />} />
        <Route path={ROUTES.venues} element={<VenueSearchPage />} />
        <Route path={PATHS.venueDetail} element={<VenueDetailPage />} />

        {/* Signed-in customers */}
        <Route element={<ProtectedRoute />}>
          <Route path={PATHS.venueBooking} element={<BookingPage />} />
          <Route path={ROUTES.checkout} element={<CheckoutPage />} />
          <Route path={ROUTES.bookings} element={<BookingsPage />} />
          <Route path={PATHS.bookingDetail} element={<BookingDetailPage />} />
          <Route path={PATHS.bookingConfirmation} element={<BookingConfirmationPage />} />
        </Route>

        {/* Administrators: one nested route per console section. */}
        <Route element={<AdminRoute />}>
          <Route
            path={PATHS.admin}
            element={
              <AdminLayout>
                <Suspense fallback={<AdminSectionFallback />}>
                  <Routes>
                    <Route index element={<AdminDashboardPage />} />
                    <Route path="users" element={<AdminUsersPage />} />
                    <Route path="courts" element={<AdminCourtsPage />} />
                    <Route path="bookings" element={<AdminBookingsPage />} />
                    <Route path="payments" element={<AdminPaymentsPage />} />
                    <Route path="reviews" element={<AdminReviewsPage />} />
                    <Route path="reports" element={<AdminReportsPage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />
                  </Routes>
                </Suspense>
              </AdminLayout>
            }
          />
        </Route>

        {/* Legacy single-page console path still resolves to the dashboard. */}
        <Route path="/admin/dashboard" element={<Navigate to={PATHS.admin} replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}