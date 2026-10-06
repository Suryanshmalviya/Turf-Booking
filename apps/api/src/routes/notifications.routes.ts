import { Router } from 'express';

import * as notificationsController from '../controllers/notifications.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import {
  listNotificationsSchema,
  markAllReadSchema,
  notificationIdParamsSchema,
} from '../validators/notifications.validator';

/** /api/v1/notifications — the caller's own notification inbox. */
const router = Router();

router.use(authenticate());

router.get('/', validate(listNotificationsSchema), notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.post(
  '/read-all',
  requireCsrf,
  validate(markAllReadSchema),
  notificationsController.markAllRead
);
router.patch(
  '/:notificationId/read',
  requireCsrf,
  validate(notificationIdParamsSchema),
  notificationsController.markRead
);
router.delete(
  '/:notificationId',
  requireCsrf,
  validate(notificationIdParamsSchema),
  notificationsController.remove
);

export default router;
