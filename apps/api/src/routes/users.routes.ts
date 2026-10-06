import { Router } from 'express';

import * as usersController from '../controllers/users.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  getUserSchema,
  listSessionsSchema,
  listUsersSchema,
  sessionIdParamsSchema,
  updateProfileSchema,
} from '../validators/users.validator';

/** /api/v1/users — profile, credentials and session management. */
const router = Router();

router.use(authenticate());

router.get('/me', usersController.profile);
router.patch('/me', requireCsrf, validate(updateProfileSchema), usersController.updateMe);
router.post('/me/password', requireCsrf, validate(changePasswordSchema), usersController.password);
router.get('/me/assignments', usersController.assignments);
router.get('/me/sessions', validate(listSessionsSchema), usersController.sessions);
router.delete(
  '/me/sessions/:sessionId',
  requireCsrf,
  validate(sessionIdParamsSchema),
  usersController.revokeSession
);

router.get('/', authorize('admin'), validate(listUsersSchema), usersController.directory);
router.get('/:userId', authorize('admin'), validate(getUserSchema), usersController.byId);

export default router;