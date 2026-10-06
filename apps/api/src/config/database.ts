import mongoose from 'mongoose';

import { config, logger } from './index';

let isConnected = false;

export async function connectDatabase(uri: string = config.mongodb.uri): Promise<void> {
  if (isConnected) {
    logger.debug('Database already connected');
    return;
  }

  try {
    mongoose.set('strictQuery', true);
    // `sanitizeFilter` is deliberately left off. It rewrites every operator
    // object into `{ $eq: { ... } }`, so legitimate filters such as
    // `{ status: { $ne: 'deleted' } }` or `{ expiresAt: { $gt: new Date() } }`
    // fail to cast and the request 400s against a real database. Query injection
    // is prevented where it can actually happen: the zod validators reject
    // unknown or operator-shaped request input, filters are built internally as
    // typed `FilterQuery<T>`, regexes are escaped in `utils/query.ts` and sort
    // fields are whitelisted in `utils/sort.ts`.

    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: config.nodeEnv !== 'production',
    });

    isConnected = true;
    logger.info({ database: mongoose.connection.name }, 'Database connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ err: error }, 'Database disconnection failed');
    throw error;
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

mongoose.connection.on('connected', () => {
  logger.debug('Mongoose connected');
});

mongoose.connection.on('error', err => {
  logger.error({ err }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected');
  isConnected = false;
});

let shutdownHandlersRegistered = false;

/** Registers graceful shutdown hooks exactly once (idempotent under tests). */
export function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'Graceful shutdown started');
    try {
      await disconnectDatabase();
    } catch (error) {
      logger.error({ err: error }, 'Error during graceful shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', reason => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', error => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}
