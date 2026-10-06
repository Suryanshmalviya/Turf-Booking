import { Router } from 'express';

import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import bookingsRoutes from './bookings.routes';
import courtsRoutes from './courts.routes';
import healthRoutes from './health.routes';
import holdsRoutes from './holds.routes';
import notificationsRoutes from './notifications.routes';
import paymentsRoutes from './payments.routes';
import reviewsRoutes from './reviews.routes';
import usersRoutes from './users.routes';

/**
 * Canonical v1 surface.
 *
 *   /api/v1/auth          authentication and sessions
 *   /api/v1/users         profile, credentials and sessions
 *   /api/v1/courts        venues, courts, availability and pricing
 *   /api/v1/bookings      booking lifecycle
 *   /api/v1/holds         pre-payment court reservations
 *   /api/v1/payments      attempts, webhooks, refunds, reconciliation
 *   /api/v1/reviews       customer reviews
 *   /api/v1/notifications the caller's notification inbox
 *   /api/v1/admin         platform administration
 *   /api/v1/health        liveness and diagnostics
 *
 * `/api/v1/venues` remains mounted as a compatibility alias for `/api/v1/courts`.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/courts', courtsRoutes);
router.use('/venues', courtsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/holds', holdsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/admin', adminRoutes);

export default router;
