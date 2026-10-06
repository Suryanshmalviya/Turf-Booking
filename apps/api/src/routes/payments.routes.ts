import { Router } from 'express';

import * as paymentsController from '../controllers/payments.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import { paymentAttemptParamsSchema } from '../validators/payments.validator';

/** /api/v1/payments — attempts, provider webhooks and reconciliation. */
const router = Router();

// Provider callback. Authenticity is established by the raw-body signature.
router.post('/webhook', paymentsController.webhook);

router.post(
  '/bookings/:bookingId/attempts',
  authenticate(),
  authorize('customer'),
  requireCsrf,
  validate(paymentAttemptParamsSchema),
  paymentsController.createAttempt
);

router.post('/reconcile', authenticate(), authorize('admin'), requireCsrf, paymentsController.reconcile);

export default router;