import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PATHS } from '../../routes/paths';
import { cn } from '../../utils/cn';
import { Container, PageShell } from '../common/Container';

/**
 * Admin console navigation.
 *
 * Rendered as links rather than buttons so each section is a real URL: it can be
 * bookmarked, shared, and reached with the back button, and the active item is
 * announced through `aria-current` instead of a hand-rolled style check.
 */
export const ADMIN_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', to: PATHS.adminDashboard, end: true },
  { id: 'users', label: 'Users', to: PATHS.adminUsers },
  { id: 'courts', label: 'Courts', to: PATHS.adminCourts },
  { id: 'bookings', label: 'Bookings', to: PATHS.adminBookings },
  { id: 'payments', label: 'Payments', to: PATHS.adminPayments },
  { id: 'reviews', label: 'Reviews', to: PATHS.adminReviews },
  { id: 'reports', label: 'Reports', to: PATHS.adminReports },
  { id: 'settings', label: 'Settings', to: PATHS.adminSettings },
] as const;

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];

export interface AdminLayoutProps {
  children?: ReactNode;
}

/** Chrome for every console section: heading, sub-navigation and the outlet. */
export function AdminLayout({ children }: AdminLayoutProps) {
  useDocumentTitle('Admin console');

  return (
    <PageShell>
      <Container size="wide">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700">Platform operations</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-950">Admin console</h1>
        <p className="mt-3 max-w-3xl text-gray-600">
          Inspect platform health, moderate courts and reviews, and audit bookings and payments. Every
          administrative action is written to the audit log.
        </p>

        <AdminNav />

        <div className="mt-8">{children ?? <Outlet />}</div>
      </Container>
    </PageShell>
  );
}

/** Sub-navigation shared by the layout and the mobile-only variant. */
export function AdminNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Admin sections" className={cn('mt-8 border-b border-gray-200', className)}>
      <ul className="-mb-px flex flex-wrap gap-x-1 gap-y-1">
        {ADMIN_SECTIONS.map(section => (
          <li key={section.id}>
            <NavLink
              to={section.to}
              end={'end' in section ? section.end : false}
              className={({ isActive }) =>
                cn(
                  'inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-slate-950'
                )
              }
            >
              {section.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}