import { startServer } from './app';
import { logger } from './config';

startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Fatal startup error');
  process.exit(1);
});