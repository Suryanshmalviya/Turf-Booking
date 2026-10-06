import { MongoMemoryServer } from 'mongodb-memory-server';

import { connectDatabase, disconnectDatabase } from '../../src/config';
import { AuthSessionModel, AuthTokenModel, UserModel } from '../../src/models/auth.model';
import { NotificationModel } from '../../src/models/notifications.model';

/**
 * Shared in-memory MongoDB for the integration suites. The binary version is
 * pinned so a cached `mongod` is reused instead of downloading one on every run;
 * `MONGOMS_VERSION` overrides it.
 */

let server: MongoMemoryServer | undefined;

export async function startTestDatabase(): Promise<void> {
  server = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' },
  });
  await connectDatabase(server.getUri('pickleball_test'));
}

export async function stopTestDatabase(): Promise<void> {
  await disconnectDatabase();
  await server?.stop();
  server = undefined;
}

export async function resetTestDatabase(): Promise<void> {
  await Promise.all([
    UserModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
    AuthTokenModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);
}