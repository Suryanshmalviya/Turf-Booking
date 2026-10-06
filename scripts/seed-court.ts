/**
 * Seed script — populates MongoDB Atlas with a sample pickleball venue.
 *
 * Court data:
 *  - Surface  : Acrylic (outdoor), 13.41m × 6.1m standard size
 *  - Timezone : Asia/Kolkata
 *  - Slot 1   : 10:00 AM → 5:00 PM  →  ₹500 / hour  (every day)
 *  - Slot 2   :  6:00 PM → 9:00 PM  →  ₹600 / hour  (every day)
 *
 * Run:
 *   npx tsx src/scripts/seed-court.ts
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// ─── DB connection ─────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) throw new Error('MONGODB_URI is not set in .env');

await mongoose.connect(MONGO_URI);
console.log('✅ Connected to MongoDB Atlas');

// ─── Import models after connect ───────────────────────────────────────────
const { UserModel } = await import('../apps/api/src/models/user.model');
const { VenueModel } = await import('../apps/api/src/models/venue.model');
const { PitchModel } = await import('../apps/api/src/models/pitch.model');
const { AvailabilityRuleModel } = await import('../apps/api/src/models/availabilityRule.model');
const { PriceRuleModel } = await import('../apps/api/src/models/priceRule.model');

// ─── 1. Ensure admin account exists for venue assignment ─────────────────
const adminEmail = process.env.ADMIN_EMAIL || 'admin@pickleball.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

const passwordHash = await bcrypt.hash(adminPassword, 12);

const admin = await UserModel.findOneAndUpdate(
  { email: adminEmail.toLowerCase() },
  {
    $set: {
      email: adminEmail.toLowerCase(),
      displayName: 'Platform Admin',
      passwordHash,
      role: 'admin',
      status: 'active',
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log(`✅ Admin account verified — email: ${admin.email}`);

// ─── 2. Create / update the venue ──────────────────────────────────────────
const venue = await VenueModel.findOneAndUpdate(
  { name: 'Pickleball Arena Mumbai' },
  {
    $set: {
      ownerId: admin._id,
      description:
        'Premium outdoor pickleball courts in the heart of Mumbai. ' +
        'Professional-grade acrylic surface, floodlit for evening play. ' +
        'Each court is full-size (13.41m × 6.1m) following official IFP standards.',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      address: {
        line1: '45 Sports Complex Road, Andheri West',
        city: 'Mumbai',
        region: 'Maharashtra',
        postalCode: '400058',
        country: 'IN',
      },
      status: 'active',
    },
    $unset: { location: '' }, // remove empty geo field to avoid 2dsphere index error
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log(`✅ Venue ready — "${venue.name}" (id: ${venue._id})`);

// ─── 3. Create / update the courts (pitches) ───────────────────────────────
const courts = [
  {
    name: 'Court A',
    description: 'Full-size outdoor pickleball court — 13.41m × 6.1m acrylic surface.',
    surface: 'Acrylic',
    indoor: false,
    sortOrder: 0,
  },
  {
    name: 'Court B',
    description: 'Full-size outdoor pickleball court — 13.41m × 6.1m acrylic surface.',
    surface: 'Acrylic',
    indoor: false,
    sortOrder: 1,
  },
];

for (const court of courts) {
  await PitchModel.findOneAndUpdate(
    { venueId: venue._id, name: court.name },
    { $set: { ...court, venueId: venue._id, isActive: true, slotIncrementMinutes: 60 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`✅ Court ready — "${court.name}"`);
}

// ─── 4. Create availability rules (open hours, every day of the week) ──────
//
//  Slot 1: 10:00 AM → 5:00 PM  (minute 600 → 1020)
//  Slot 2:  6:00 PM → 9:00 PM  (minute 1080 → 1260)
//
// dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday

// Clear old rules for this venue to avoid duplicates
await AvailabilityRuleModel.deleteMany({ venueId: venue._id });

const days = [0, 1, 2, 3, 4, 5, 6]; // every day

const availabilitySlots = [
  { startMinute: 600, endMinute: 1020 }, // 10:00 AM – 5:00 PM
  { startMinute: 1080, endMinute: 1260 }, //  6:00 PM – 9:00 PM
];

for (const day of days) {
  for (const slot of availabilitySlots) {
    await AvailabilityRuleModel.create({
      venueId: venue._id,
      dayOfWeek: day,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      isActive: true,
    });
  }
}
console.log('✅ Availability rules set — 10am–5pm + 6pm–9pm, every day');

// ─── 5. Create price rules ──────────────────────────────────────────────────
//
//  ₹500/hour  for 10:00 AM → 5:00 PM  (priority 1)
//  ₹600/hour  for  6:00 PM → 9:00 PM  (priority 2 — wins over default)
//
// amountMinor is in smallest currency unit (paise): ₹500 = 50000 paise

await PriceRuleModel.deleteMany({ venueId: venue._id });

await PriceRuleModel.create([
  {
    venueId: venue._id,
    startMinute: 600, // 10:00 AM
    endMinute: 1020, //  5:00 PM
    amountMinor: 50000, // ₹500
    currency: 'INR',
    pricingUnit: 'hour',
    minDurationMinutes: 60,
    maxDurationMinutes: 120,
    priority: 1,
    isActive: true,
  },
  {
    venueId: venue._id,
    startMinute: 1080, //  6:00 PM
    endMinute: 1260, //  9:00 PM
    amountMinor: 60000, // ₹600
    currency: 'INR',
    pricingUnit: 'hour',
    minDurationMinutes: 60,
    maxDurationMinutes: 120,
    priority: 2,
    isActive: true,
  },
]);
console.log('✅ Price rules set — ₹500/hr (10am–5pm)  |  ₹600/hr (6pm–9pm)');

// ─── Done ───────────────────────────────────────────────────────────────────
console.log('\n🎉 Seed complete! Summary:');
console.log('   Venue   :', venue.name);
console.log('   Courts  : Court A, Court B (13.41m × 6.1m acrylic, outdoor)');
console.log('   Hours   : 10:00 AM – 5:00 PM  +  6:00 PM – 9:00 PM  (daily)');
console.log('   Pricing : ₹500/hr (morning/afternoon) | ₹600/hr (evening)');
console.log('   Admin   :', adminEmail, '/', adminPassword);
console.log('\n   → Open http://localhost:5173/venues to see the court live\n');

await mongoose.disconnect();
process.exit(0);
