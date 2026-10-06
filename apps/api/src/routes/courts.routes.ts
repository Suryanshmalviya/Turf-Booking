import { Router } from 'express';

import * as courtsController from '../controllers/courts.controller';
import * as reviewsController from '../controllers/reviews.controller';
import { authenticate, optionalAuth, requireCsrf } from '../middleware/auth.middleware';
import { requireVenueAccess } from '../middleware/authorization';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import {
  availabilityQuerySchema,
  blackoutSchema,
  calendarQuerySchema,
  courtIdParamsSchema,
  courtPitchParamsSchema,
  courtReviewSchema,
  createAvailabilityExceptionSchema,
  createAvailabilityRuleSchema,
  createCourtPitchSchema,
  createCourtSchema,
  createPriceRuleSchema,
  listCourtsSchema,
  updateCourtPitchSchema,
  updateCourtSchema,
} from '../validators/courts.validator';
import { listReviewsSchema } from '../validators/reviews.validator';

/**
 * /api/v1/courts — venue (facility) discovery plus the courts inside it, their
 * operating hours, pricing and per-slot availability.
 *
 * The same router is mounted at /api/v1/venues for backwards compatibility with
 * existing clients.
 */
const router = Router();

const operators = [authenticate(), authorize('venue_owner', 'venue_staff', 'admin')];
const owners = [authenticate(), authorize('venue_owner', 'admin')];

// ---- public reads
router.get('/', optionalAuth(), validate(listCourtsSchema), courtsController.list);
router.get('/:venueId', validate(courtIdParamsSchema), courtsController.detail);
router.get('/:venueId/schedule', validate(courtIdParamsSchema), courtsController.schedule);
router.get(
  '/:venueId/pitches/:pitchId/availability',
  validate(availabilityQuerySchema),
  courtsController.availability
);
router.get('/:venueId/reviews', validate(listReviewsSchema), reviewsController.list);
router.get('/:venueId/rating', validate(courtIdParamsSchema), reviewsController.summary);

// ---- venue management
router.post('/', ...owners, requireCsrf, validate(createCourtSchema), courtsController.create);
router.patch(
  '/:venueId',
  ...owners,
  requireCsrf,
  validate(updateCourtSchema),
  requireVenueAccess(),
  courtsController.update
);

// ---- courts (pitches) inside a venue
router.post(
  '/:venueId/pitches',
  ...owners,
  requireCsrf,
  validate(createCourtPitchSchema),
  requireVenueAccess(),
  courtsController.createPitch
);
router.patch(
  '/:venueId/pitches/:pitchId',
  ...owners,
  requireCsrf,
  validate(updateCourtPitchSchema),
  requireVenueAccess(),
  courtsController.updatePitch
);
router.delete(
  '/:venueId/pitches/:pitchId',
  ...owners,
  requireCsrf,
  validate(courtPitchParamsSchema),
  requireVenueAccess(),
  courtsController.deletePitch
);

// ---- operating hours, exceptions and pricing
router.post(
  '/:venueId/availability-rules',
  ...owners,
  requireCsrf,
  validate(createAvailabilityRuleSchema),
  requireVenueAccess(),
  courtsController.createRule
);
router.post(
  '/:venueId/availability-exceptions',
  ...owners,
  requireCsrf,
  validate(createAvailabilityExceptionSchema),
  requireVenueAccess(),
  courtsController.createException
);
router.post(
  '/:venueId/price-rules',
  ...owners,
  requireCsrf,
  validate(createPriceRuleSchema),
  requireVenueAccess(),
  courtsController.createPrice
);

// ---- operator views
router.get(
  '/:venueId/calendar',
  ...operators,
  validate(calendarQuerySchema),
  requireVenueAccess(),
  courtsController.calendar
);
router.post(
  '/:venueId/blackouts',
  ...owners,
  requireCsrf,
  validate(blackoutSchema),
  courtsController.blackout
);

// ---- administrative moderation (mirrored by /admin/venues/:venueId/:action)
router.post(
  '/:venueId/review/:action',
  authenticate(),
  authorize('admin'),
  requireCsrf,
  validate(courtReviewSchema),
  courtsController.review
);

export default router;
