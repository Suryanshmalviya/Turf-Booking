import { Router } from 'express';

import * as authController from '../controllers/auth.controller';
import { authenticate, requireCsrf } from '../middleware/auth.middleware';
import { authLimiter, passwordRecoveryLimiter, rateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator';

/**
 * /api/v1/auth
 *
 * Credential endpoints (register, login, recovery, verification) carry a tight
 * rate limit. Cookie-authorised state changes additionally require the double
 * submit CSRF header. Tokens are only ever handed out as `HttpOnly` cookies, so a
 * successful response body contains nothing an XSS payload could read.
 */
const router = Router();

/**
 * Built once so every endpoint below draws from the same counter: registering,
 * signing in and verifying share the credential budget, while the recovery
 * endpoints share a single, much smaller one. A separate instance per route would
 * hand an attacker the budget multiplied by the number of routes.
 */
const credentialLimiter = rateLimit(authLimiter());
const recoveryLimiter = rateLimit(passwordRecoveryLimiter());

router.post('/register', credentialLimiter, validate(registerSchema), authController.register);
router.post('/login', credentialLimiter, validate(loginSchema), authController.login);
router.post('/refresh', requireCsrf, authController.refresh);
router.post('/logout', requireCsrf, authController.logout);
router.get('/me', authenticate(), authController.me);

router.post(
  '/forgot-password',
  recoveryLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  recoveryLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);
router.post(
  '/verify-email',
  credentialLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail
);
router.post(
  '/resend-verification',
  credentialLimiter,
  authenticate(),
  requireCsrf,
  authController.resendVerification
);

export default router;
