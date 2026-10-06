import { Router } from 'express';

import * as reviewsController from '../controllers/reviews.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import {
  createReviewSchema,
  listMyReviewsSchema,
  listReviewsSchema,
  moderateReviewSchema,
  replyToReviewSchema,
  reviewIdParamsSchema,
  reviewSummarySchema,
  updateReviewSchema,
} from '../validators/reviews.validator';

/** /api/v1/reviews — customer ratings for completed bookings. */
const router = Router();

router.get('/', validate(listReviewsSchema), reviewsController.list);
router.get('/summary', validate(reviewSummarySchema), reviewsController.summary);
router.get('/mine', authenticate(), validate(listMyReviewsSchema), reviewsController.listMine);
router.get('/:reviewId', validate(reviewIdParamsSchema), reviewsController.detail);

router.post(
  '/',
  authenticate(),
  authorize('customer'),
  requireCsrf,
  validate(createReviewSchema),
  reviewsController.create
);
router.patch(
  '/:reviewId',
  authenticate(),
  requireCsrf,
  validate(updateReviewSchema),
  reviewsController.update
);
router.delete('/:reviewId', authenticate(), requireCsrf, validate(reviewIdParamsSchema), reviewsController.remove);

router.post(
  '/:reviewId/replies',
  authenticate(),
  authorize('venue_owner', 'venue_staff', 'admin'),
  requireCsrf,
  validate(replyToReviewSchema),
  reviewsController.reply
);

router.patch(
  '/:reviewId/moderation',
  authenticate(),
  authorize('admin'),
  requireCsrf,
  validate(moderateReviewSchema),
  reviewsController.moderate
);

export default router;