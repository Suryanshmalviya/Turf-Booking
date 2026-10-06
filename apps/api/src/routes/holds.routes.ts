import { Router } from 'express';

import * as bookingsController from '../controllers/bookings.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import { bookingIdParamsSchema, createHoldSchema } from '../validators/bookings.validator';

/**
 * /api/v1/holds — short-lived court reservations that precede payment.
 * Held for `BOOKING_HOLD_MINUTES`; confirming requires a verified payment.
 */
const router = Router();

router.use(authenticate(), authorize('customer'));

router.post('/', requireCsrf, validate(createHoldSchema), bookingsController.createHold);
router.post('/:bookingId/confirm', requireCsrf, validate(bookingIdParamsSchema), bookingsController.confirmHold);

export default router;