import { Router } from 'express';

import * as healthController from '../controllers/health.controller';
import { validate } from '../middleware/validate';
import { healthCheckQuerySchema } from '../validators/health.validator';

/** /api/v1/health — liveness and dependency diagnostics. */
const router = Router();

router.get('/', validate(healthCheckQuerySchema), healthController.healthCheck);
router.get('/detailed', healthController.detailedHealthCheck);

export default router;