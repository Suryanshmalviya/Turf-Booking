import type { Express } from 'express';
import express from 'express';

import { config, logger } from './config';
import { ensureAdminUser } from './config/admin-bootstrap';
import { connectDatabase, registerShutdownHandlers } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { logStartup, requestLogger } from './middleware/logging';
import { globalLimiter, rateLimit } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { applySecurity, bodyParsers } from './middleware/security';
import apiRoutes from './routes';

/**
 * Builds the Express application. Kept separate from `server.ts` so tests and
 * tooling can mount the API without opening a listening socket.
 */
export function createApp(): Express {
  const app = express();

  // 1. Correlation id first, so every downstream log line and response carries it.
  app.use(requestId());

  // 2. Security posture and transport concerns.
  applySecurity(app);

  // 3. Body parsing (JSON with raw-body capture for provider webhooks).
  for (const parser of bodyParsers()) app.use(parser);

  // 4. Access logging, then throttling.
  app.use(requestLogger());
  app.use(rateLimit(globalLimiter()));

  // 5. Versioned API surface (/api/v1/...).
  app.use(config.apiPrefix, apiRoutes);

  // 6. Terminal handlers: unmatched route, then the central error mapper.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

/** Connects dependencies, bootstraps the admin account and starts listening. */
export async function startServer(): Promise<void> {
  await connectDatabase();
  await ensureAdminUser();
  registerShutdownHandlers();

  const server = app.listen(config.port, () => logStartup());

  server.on('error', error => {
    logger.fatal({ err: error, port: config.port }, 'HTTP server error');
    process.exit(1);
  });
}

export default app;