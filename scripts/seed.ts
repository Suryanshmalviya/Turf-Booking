import { connectDatabase, disconnectDatabase, logger } from '../apps/api/src/config';
import { ensureAdminUser } from '../apps/api/src/config/admin-bootstrap';
import { UserModel } from '../apps/api/src/models/user.model';
import { VenueModel } from '../apps/api/src/models/venue.model';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing seed environment variable: ${name}`);
  return value;
};

await connectDatabase();
try {
  await ensureAdminUser();

  const owner = await UserModel.findOneAndUpdate(
    { email: required('SEED_OWNER_EMAIL').toLowerCase() },
    {
      $set: {
        displayName: required('SEED_OWNER_DISPLAY_NAME'),
        passwordHash: required('SEED_OWNER_PASSWORD_HASH'),
        role: 'venue_owner',
        status: 'active',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await VenueModel.findOneAndUpdate(
    { ownerId: owner._id, name: required('SEED_VENUE_NAME') },
    {
      $set: {
        description: process.env.SEED_VENUE_DESCRIPTION ?? '',
        timezone: required('SEED_VENUE_TIMEZONE'),
        address: {
          line1: required('SEED_VENUE_ADDRESS_LINE1'),
          city: required('SEED_VENUE_CITY'),
          region: required('SEED_VENUE_REGION'),
          postalCode: required('SEED_VENUE_POSTAL_CODE'),
          country: required('SEED_VENUE_COUNTRY').toUpperCase(),
        },
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  logger.info('Seed completed');
} finally {
  await disconnectDatabase();
}
