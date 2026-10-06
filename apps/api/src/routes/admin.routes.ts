import { Router } from 'express';

import * as adminController from '../controllers/admin.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { createLimiter, rateLimit } from '../middleware/rate-limit';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import {
  adminBookingListSchema,
  adminCreateVenueSchema,
  adminExportSchema,
  adminPageSchema,
  adminProcessNotificationsSchema,
  adminReportSchema,
  adminUpdateUserSchema,
  adminVenueActionSchema,
} from '../validators/admin.validator';

/**
 * /api/v1/admin — platform operations. Every route requires an administrator.
 *
 * `/venues/...` paths are retained alongside `/courts/...` so existing admin
 * tooling keeps working.
 */
const router = Router();

router.use(authenticate(), authorize('admin'));

router.get('/database', adminController.database);
router.post(
  '/database/seed',
  requireCsrf,
  rateLimit(createLimiter(2, 'ADMIN_SEED_RATE_LIMITED', 'Seeding is limited to 2 requests per window')),
  adminController.seed
);

router.get('/venues/queue', validate(adminPageSchema), adminController.venueQueue);
router.get('/courts/queue', validate(adminPageSchema), adminController.venueQueue);

router.get('/users', validate(adminPageSchema), adminController.users);
router.patch(
  '/users/:userId',
  requireCsrf,
  validate(adminUpdateUserSchema),
  adminController.updateUser
);

router.get('/venues', validate(adminPageSchema), adminController.venues);
router.get('/courts', validate(adminPageSchema), adminController.venues);
router.post('/venues', requireCsrf, validate(adminCreateVenueSchema), adminController.createVenue);
router.post('/courts', requireCsrf, validate(adminCreateVenueSchema), adminController.createVenue);

router.get('/bookings', validate(adminBookingListSchema), adminController.bookings);
router.get('/bookings/:bookingId/payments', adminController.bookingPayments);

router.get('/reports', validate(adminReportSchema), adminController.report);
router.get('/exports/bookings', validate(adminExportSchema), adminController.exportBookingRows);

router.post('/venues/:venueId/:action', requireCsrf, validate(adminVenueActionSchema), adminController.action);
router.post('/courts/:venueId/:action', requireCsrf, validate(adminVenueActionSchema), adminController.action);

router.post(
  '/notifications/process',
  requireCsrf,
  rateLimit(createLimiter(5, 'ADMIN_NOTIFICATION_RATE_LIMITED', 'Outbox processing is limited')),
  validate(adminProcessNotificationsSchema),
  adminController.processNotifications
);

export default router;