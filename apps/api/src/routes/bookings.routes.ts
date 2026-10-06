import { Router } from 'express';

import * as bookingsController from '../controllers/bookings.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import {
  bookingIdParamsSchema,
  cancelBookingSchema,
  listMyBookingsSchema,
  refundRequestSchema,
} from '../validators/bookings.validator';

/** /api/v1/bookings — customer booking lifecycle. */
const router = Router();

router.use(authenticate());

router.get('/', authorize('customer', 'admin'), validate(listMyBookingsSchema), bookingsController.listMine);
router.get('/:bookingId', validate(bookingIdParamsSchema), bookingsController.getMine);

router.post(
  '/:bookingId/cancel',
  authorize('customer', 'venue_owner', 'venue_staff', 'admin'),
  requireCsrf,
  validate(cancelBookingSchema),
  bookingsController.cancel
);

router.post(
  '/:bookingId/refunds',
  authorize('venue_owner', 'admin'),
  requireCsrf,
  validate(refundRequestSchema),
  bookingsController.refund
);

export default router;