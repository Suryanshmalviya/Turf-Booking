import type { FilterQuery } from 'mongoose';

import { logger } from '../config';
import { AuditLogModel } from '../models/admin.model';
import { VenueStaffAssignmentModel } from '../models/auth.model';
import { BookingModel } from '../models/bookings.model';
import {
  AvailabilityExceptionModel,
  AvailabilityRuleModel,
  PitchModel,
  PriceRuleModel,
  type VenueDocument,
  VenueModel,
} from '../models/courts.model';
import type { JwtPayload } from '../types/auth';
import type { VenueStatus } from '../types/enums';
import type { PaginationMeta, SortSpec } from '../types/pagination';
import { ApiError } from '../utils/api-error';
import { paginateWithMeta } from '../utils/paginate';
import { withLegacyPagination } from '../utils/pagination';
import { containsRegex, exactRegex } from '../utils/query';
import { parseSort, type SortWhitelist } from '../utils/sort';
import { isVenueOpenAt } from './availability.service';
import { getVenueRatingSummary } from './reviews.service';

export const VENUE_SORT_WHITELIST: SortWhitelist = {
  name: 1,
  createdAt: 1,
  updatedAt: 1,
  'address.city': 1,
  status: 1,
};

export const VENUE_SORT_FALLBACK: SortSpec = { name: 1 };

const PUBLIC_VENUE_PROJECTION = '-ownerId -reviewReason -reviewedBy -reviewedAt' as const;

export interface CourtListQuery {
  page: number;
  limit: number;
  city?: string;
  q?: string;
  date?: string;
  time?: string;
  maxPrice?: number;
  feature?: 'indoor' | 'outdoor';
  status?: VenueStatus;
  sort?: string;
}

// ---------------------------------------------------------------- access control

export async function isVenueOwner(venueId: string, userId: string): Promise<boolean> {
  return Boolean(await VenueModel.exists({ _id: venueId, ownerId: userId }));
}

export async function hasStaffAssignment(venueId: string, userId: string): Promise<boolean> {
  return Boolean(await VenueStaffAssignmentModel.exists({ venueId, userId, active: true }));
}

/**
 * Single authority for venue-scoped authorization: administrators, the owning
 * account and actively assigned staff. Throws 403 otherwise.
 */
export async function assertVenueAccess(venueId: string, actor: JwtPayload): Promise<void> {
  if (actor.role === 'admin') return;

  if (actor.role === 'venue_owner' && (await isVenueOwner(venueId, actor.sub))) return;
  if (actor.role === 'venue_staff' && (await hasStaffAssignment(venueId, actor.sub))) return;

  throw ApiError.forbidden('You do not have access to this venue');
}

// ---------------------------------------------------------------- public reads

/**
 * Court discovery with free-text search, city, feature, price ceiling and
 * "open at a local date/time" filtering, backed by pagination and whitelisted
 * sorting.
 */
export async function listCourts(query: CourtListQuery) {
  const filter: FilterQuery<VenueDocument> = { status: query.status ?? 'active' };

  if (query.city) filter['address.city'] = exactRegex(query.city);
  if (query.q) {
    filter['$or'] = [
      { name: containsRegex(query.q) },
      { description: containsRegex(query.q) },
      { 'address.city': containsRegex(query.q) },
    ];
  }

  const [featureVenueIds, priceVenueIds] = await Promise.all([
    query.feature
      ? PitchModel.find({ indoor: query.feature === 'indoor', isActive: true }).distinct('venueId')
      : Promise.resolve(null),
    query.maxPrice !== undefined
      ? PriceRuleModel.find({ amountMinor: { $lte: query.maxPrice }, isActive: true }).distinct(
          'venueId'
        )
      : Promise.resolve(null),
  ]);

  const intersected = intersectIds(featureVenueIds, priceVenueIds);
  if (intersected) filter['_id'] = { $in: intersected };

  if (query.date && query.time) {
    const openVenueIds = await filterOpenVenues(filter, query.date, query.time);
    filter['_id'] = { $in: openVenueIds };
  }

  const page = await paginateWithMeta<VenueDocument>(VenueModel, filter, {
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, VENUE_SORT_WHITELIST, VENUE_SORT_FALLBACK),
    select: PUBLIC_VENUE_PROJECTION,
  });

  return withLegacyPagination(page);
}

function intersectIds(left: unknown[] | null, right: unknown[] | null): unknown[] | null {
  if (!left && !right) return null;
  if (left && right) {
    const rightKeys = new Set(right.map(value => String(value)));
    return left.filter(value => rightKeys.has(String(value)));
  }
  return (left ?? right) as unknown[];
}

async function filterOpenVenues(
  filter: FilterQuery<VenueDocument>,
  date: string,
  time: string
): Promise<unknown[]> {
  const [hour, minute] = time.split(':').map(Number);
  const requestedMinute = hour * 60 + minute;
  const candidates = await VenueModel.find(filter).select('_id timezone').lean();

  const openness = await Promise.all(
    candidates.map(venue => isVenueOpenAt(venue, date, requestedMinute))
  );
  return candidates.filter((_venue, index) => openness[index]).map(venue => venue._id);
}

export async function getPublicCourt(venueId: string) {
  const venue = await VenueModel.findOne({ _id: venueId, status: 'active' })
    .select(PUBLIC_VENUE_PROJECTION)
    .lean();
  if (!venue) throw ApiError.notFound('Venue');

  const [pitches, rating] = await Promise.all([
    PitchModel.find({ venueId, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    getVenueRatingSummary(venueId),
  ]);

  return { venue, pitches, rating };
}

export async function listCourtSchedule(venueId: string) {
  if (!(await VenueModel.exists({ _id: venueId, status: 'active' }))) {
    throw ApiError.notFound('Venue');
  }

  const [rules, exceptions, prices] = await Promise.all([
    AvailabilityRuleModel.find({ venueId, isActive: true })
      .sort({ dayOfWeek: 1, startMinute: 1 })
      .lean(),
    AvailabilityExceptionModel.find({ venueId }).sort({ date: 1, startMinute: 1 }).lean(),
    PriceRuleModel.find({ venueId, isActive: true }).sort({ priority: -1 }).lean(),
  ]);

  return { rules, exceptions, prices };
}

// ---------------------------------------------------------------- venue writes

export async function createCourt(ownerId: string, input: Record<string, unknown>) {
  return VenueModel.create({ ...input, ownerId, status: 'draft' });
}

export async function updateCourt(
  venueId: string,
  actor: JwtPayload,
  input: Record<string, unknown>
) {
  const filter: FilterQuery<VenueDocument> =
    actor.role === 'admin' ? { _id: venueId } : { _id: venueId, ownerId: actor.sub };

  const venue = await VenueModel.findOneAndUpdate(
    filter,
    { $set: input },
    {
      new: true,
      runValidators: true,
    }
  );
  if (!venue) throw ApiError.notFound('Venue');
  return venue;
}

/** Administrative moderation transition for a court (approve/reject/suspend). */
export async function reviewCourt(input: {
  venueId: string;
  actorId: string;
  status: 'active' | 'rejected' | 'suspended';
  reason: string;
  requestId?: string;
}) {
  if (!input.reason.trim()) throw ApiError.badRequest('Review reason is required');

  const venue = await VenueModel.findByIdAndUpdate(
    input.venueId,
    {
      $set: {
        status: input.status,
        reviewReason: input.reason,
        reviewedAt: new Date(),
        reviewedBy: input.actorId,
      },
    },
    { new: true, runValidators: true }
  );
  if (!venue) throw ApiError.notFound('Venue');

  await AuditLogModel.create({
    actorId: input.actorId,
    action: `venue.${input.status}`,
    resourceType: 'Venue',
    resourceId: venue._id,
    requestId: input.requestId,
    metadata: { reason: input.reason },
  });

  logger.info({ venueId: venue._id, status: input.status }, 'Venue status changed');
  return venue;
}

// ---------------------------------------------------------------- courts (pitches)

export async function addPitch(venueId: string, input: Record<string, unknown>) {
  return PitchModel.create({ ...input, venueId });
}

export async function updatePitch(
  venueId: string,
  pitchId: string,
  input: Record<string, unknown>
) {
  const pitch = await PitchModel.findOneAndUpdate(
    { _id: pitchId, venueId },
    { $set: input },
    {
      new: true,
      runValidators: true,
    }
  );
  if (!pitch) throw ApiError.notFound('Court');
  return pitch;
}

/** Courts are deactivated rather than deleted so historic bookings stay valid. */
export async function deactivatePitch(venueId: string, pitchId: string) {
  const pitch = await PitchModel.findOneAndUpdate(
    { _id: pitchId, venueId },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!pitch) throw ApiError.notFound('Court');
  return pitch;
}

// ---------------------------------------------------------------- scheduling config

export async function createAvailabilityRule(venueId: string, input: Record<string, unknown>) {
  return AvailabilityRuleModel.create({ ...input, venueId });
}

export async function createAvailabilityException(
  venueId: string,
  input: { kind: 'blackout' | 'special_open'; [key: string]: unknown }
) {
  return AvailabilityExceptionModel.create({
    ...input,
    venueId,
    isAvailable: input.kind === 'special_open',
  });
}

export async function createPriceRule(venueId: string, input: Record<string, unknown>) {
  return PriceRuleModel.create({ ...input, venueId });
}

// ---------------------------------------------------------------- operator views

export async function listVenueCalendar(input: {
  venueId: string;
  actor: JwtPayload;
  from: Date;
  to: Date;
}): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  await assertVenueAccess(input.venueId, input.actor);

  const { items, meta } = await paginateWithMeta(
    BookingModel,
    {
      venueId: input.venueId,
      startAt: { $lt: input.to },
      endAt: { $gt: input.from },
    },
    { page: 1, limit: 200, sort: { startAt: 1 } }
  );

  return { items, meta };
}

/** Venue-wide blackout created by an owner or administrator. */
export async function operatorBlackout(input: {
  venueId: string;
  actor: JwtPayload;
  date: Date;
  reason: string;
}) {
  if (input.actor.role === 'venue_owner') await assertVenueAccess(input.venueId, input.actor);
  if (!input.reason.trim()) throw ApiError.badRequest('Blackout reason is required');

  const exception = await AvailabilityExceptionModel.create({
    venueId: input.venueId,
    date: input.date,
    kind: 'blackout',
    isAvailable: false,
    reason: input.reason,
  });

  await AuditLogModel.create({
    actorId: input.actor.sub,
    action: 'availability.operator_blackout',
    resourceType: 'Venue',
    resourceId: input.venueId,
    metadata: { reason: input.reason, date: input.date.toISOString() },
  });

  return exception;
}
