import bcrypt from 'bcryptjs';

import { UserModel } from '../models/user.model';
import { config, logger } from './index';

/**
 * Ensures that the admin account defined in the backend configuration (.env)
 * exists in MongoDB with an active status and the admin role. Idempotent: safe
 * to run on every boot.
 */
export async function ensureAdminUser(): Promise<void> {
  try {
    const email = (config.admin.email || 'admin@pickleball.com').trim().toLowerCase();
    const password = config.admin.password || 'Admin@12345';
    const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);

    const user = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          displayName: 'Platform Admin',
          passwordHash,
          role: 'admin',
          status: 'active',
          // Bootstrap accounts are trusted, so they skip the verification flow.
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info({ adminId: user._id, email: user.email, role: user.role }, 'Admin account ready');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize default admin account in database');
  }
}