import { describe, expect, it, vi } from 'vitest';

import { AvailabilityExceptionModel, AvailabilityRuleModel } from '../src/models/courts.model';
import {
  calculateAvailability,
  intervalsOverlap,
  isHoldActive,
  isVenueOpenAt,
  priceForInterval,
  selectPriceRule,
  slotKeys,
} from '../src/services/availability.service';
import { VENUE_SORT_FALLBACK, VENUE_SORT_WHITELIST } from '../src/services/courts.service';
import { ApiError } from '../src/utils/api-error';
import { parseSort } from '../src/utils/sort';
import {
  isIanaTimezone,
  localDateParts,
  nextDateKey,
  zonedDateTimeToUtc,
} from '../src/utils/timezone';
import {
  createAvailabilityExceptionSchema,
  createPriceRuleSchema,
  listCourtsSchema,
} from '../src/validators/courts.validator';

describe('interval maths', () => {
  it('treats intervals as start-inclusive and end-exclusive', () => {
    expect(
      intervalsOverlap(
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T11:00:00Z'),
        new Date('2026-01-01T11:00:00Z'),
        new Date('2026-01-01T12:00:00Z')
      )
    ).toBe(false);

    expect(
      intervalsOverlap(
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T11:00:00Z'),
        new Date('2026-01-01T10:59:00Z'),
        new Date('2026-01-01T12:00:00Z')
      )
    ).toBe(true);
  });

  it('stops treating expired holds as active before TTL cleanup', () => {
    const now = new Date('2026-01-01T10:00:00Z');

    expect(isHoldActive('held', new Date('2026-01-01T09:59:59Z'), now)).toBe(false);
    expect(isHoldActive('held', new Date('2026-01-01T10:00:01Z'), now)).toBe(true);
    expect(isHoldActive('confirmed', new Date('2026-01-01T10:00:01Z'), now)).toBe(false);
  });

  it('enumerates every slot boundary an interval touches', () => {
    const slots = slotKeys(new Date('2026-01-01T10:00:00Z'), new Date('2026-01-01T11:00:00Z'), 30);

    expect(slots).toHaveLength(2);
    expect(slots[0].toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(slots[1].toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
});

describe('timezone helpers', () => {
  it('recognises IANA zones and converts UTC around daylight-saving boundaries', () => {
    expect(isIanaTimezone('America/New_York')).toBe(true);
    expect(isIanaTimezone('EST')).toBe(false);
    expect(localDateParts(new Date('2026-03-08T14:30:00Z'), 'America/New_York')).toMatchObject({
      dateKey: '2026-03-08',
      minute: 630,
    });
  });

  it('round-trips a local wall-clock time and rolls the date key forward', () => {
    const utc = zonedDateTimeToUtc('2026-04-01', 9 * 60, 'Asia/Kolkata');
    expect(localDateParts(utc, 'Asia/Kolkata')).toMatchObject({
      dateKey: '2026-04-01',
      minute: 540,
    });
    expect(nextDateKey('2026-12-31')).toBe('2027-01-01');
  });
});

describe('pricing', () => {
  const rules = [
    {
      isActive: true,
      priority: 1,
      dayOfWeek: 0,
      startMinute: 500,
      endMinute: 900,
      amountMinor: 1000,
      currency: 'INR',
      pricingUnit: 'booking' as const,
    },
    {
      isActive: true,
      priority: 5,
      dayOfWeek: 0,
      startMinute: 500,
      endMinute: 900,
      minDurationMinutes: 60,
      maxDurationMinutes: 120,
      amountMinor: 1500,
      currency: 'INR',
      pricingUnit: 'booking' as const,
    },
  ];

  it('selects the highest-priority rule matching date, local time and duration', () => {
    const selected = selectPriceRule(
      rules,
      new Date('2026-01-04T09:00:00Z'),
      new Date('2026-01-04T10:00:00Z'),
      'UTC'
    );

    expect(selected?.amountMinor).toBe(1500);
  });

  it('prices hourly rules proportionally to duration', () => {
    const hourly = [{ ...rules[0], pricingUnit: 'hour' as const, amountMinor: 50000, priority: 1 }];

    expect(
      priceForInterval(
        hourly,
        new Date('2026-01-04T09:00:00Z'),
        new Date('2026-01-04T10:30:00Z'),
        'UTC',
        'INR'
      ).priceMinor
    ).toBe(100000);
    expect(
      priceForInterval(
        [],
        new Date('2026-01-04T09:00:00Z'),
        new Date('2026-01-04T10:00:00Z'),
        'UTC',
        'INR'
      )
    ).toEqual({
      priceMinor: 0,
      currency: 'INR',
    });
  });
});

describe('availability calculation', () => {
  const leanQuery = (rows: unknown[]) => ({ lean: () => Promise.resolve(rows) });

  it('rejects a non-positive duration before touching the database', async () => {
    await expect(calculateAvailability('venue', 'pitch', '2026-04-01', 0)).rejects.toBeInstanceOf(
      ApiError
    );
    await expect(calculateAvailability('venue', 'pitch', '2026-04-01', 1441)).rejects.toThrow(
      /no greater than 1440/
    );
  });

  it('reports a closed venue when the day is blacked out', async () => {
    vi.spyOn(AvailabilityRuleModel, 'find').mockReturnValue(
      leanQuery([{ startMinute: 480, endMinute: 1320 }]) as never
    );
    vi.spyOn(AvailabilityExceptionModel, 'find').mockReturnValue(
      leanQuery([{ kind: 'blackout' }]) as never
    );

    await expect(
      isVenueOpenAt({ _id: 'venue' as never, timezone: 'UTC' }, '2026-04-01', 600)
    ).resolves.toBe(false);
  });

  it('reports an open venue inside a regular window', async () => {
    vi.spyOn(AvailabilityRuleModel, 'find').mockReturnValue(
      leanQuery([{ startMinute: 480, endMinute: 1320 }]) as never
    );
    vi.spyOn(AvailabilityExceptionModel, 'find').mockReturnValue(leanQuery([]) as never);

    await expect(
      isVenueOpenAt({ _id: 'venue' as never, timezone: 'UTC' }, '2026-04-01', 600)
    ).resolves.toBe(true);
  });

  it('treats window boundaries as start-inclusive and end-exclusive', async () => {
    vi.spyOn(AvailabilityRuleModel, 'find').mockReturnValue(
      leanQuery([{ startMinute: 480, endMinute: 1320 }]) as never
    );
    vi.spyOn(AvailabilityExceptionModel, 'find').mockReturnValue(leanQuery([]) as never);
    const venue = { _id: 'venue' as never, timezone: 'UTC' };

    await expect(isVenueOpenAt(venue, '2026-04-01', 480)).resolves.toBe(true);
    await expect(isVenueOpenAt(venue, '2026-04-01', 479)).resolves.toBe(false);
    await expect(isVenueOpenAt(venue, '2026-04-01', 1320)).resolves.toBe(false);
  });

  it('prefers an explicit special opening over the regular schedule', async () => {
    vi.spyOn(AvailabilityRuleModel, 'find').mockReturnValue(
      leanQuery([{ startMinute: 480, endMinute: 1320 }]) as never
    );
    vi.spyOn(AvailabilityExceptionModel, 'find').mockReturnValue(
      leanQuery([{ kind: 'special_open', startMinute: 1080, endMinute: 1440 }]) as never
    );
    const venue = { _id: 'venue' as never, timezone: 'UTC' };

    await expect(isVenueOpenAt(venue, '2026-04-01', 600)).resolves.toBe(false);
    await expect(isVenueOpenAt(venue, '2026-04-01', 1200)).resolves.toBe(true);
  });
});

describe('court validators', () => {
  it('requires intervals for special openings but permits all-day blackouts', () => {
    expect(
      createAvailabilityExceptionSchema.safeParse({
        params: { venueId: '507f1f77bcf86cd799439011' },
        body: { date: '2026-04-01', kind: 'blackout', reason: 'Private event' },
      }).success
    ).toBe(true);

    expect(
      createAvailabilityExceptionSchema.safeParse({
        params: { venueId: '507f1f77bcf86cd799439011' },
        body: { date: '2026-04-01', kind: 'special_open' },
      }).success
    ).toBe(false);
  });

  it('rejects inverted special opening intervals', () => {
    expect(
      createAvailabilityExceptionSchema.safeParse({
        params: { venueId: '507f1f77bcf86cd799439011' },
        body: { date: '2026-04-01', kind: 'special_open', startMinute: 900, endMinute: 600 },
      }).success
    ).toBe(false);
  });

  it('rejects inverted pricing ranges', () => {
    expect(
      createPriceRuleSchema.safeParse({
        params: { venueId: '507f1f77bcf86cd799439011' },
        body: {
          amountMinor: 1000,
          currency: 'INR',
          startDate: '2026-05-02',
          endDate: '2026-05-01',
        },
      }).success
    ).toBe(false);
  });

  it('coerces pagination and applies sort defaults', () => {
    const parsed = listCourtsSchema.parse({
      query: { page: '3', limit: '10', sort: '-createdAt' },
    });

    expect(parsed.query).toMatchObject({ page: 3, limit: 10, sort: '-createdAt' });
  });

  it('rejects unknown sort fields at the service boundary so sort injection is impossible', () => {
    expect(listCourtsSchema.parse({ query: { sort: 'createdAt' } }).query.sort).toBe('createdAt');
    expect(() => parseSort('ownerId', VENUE_SORT_WHITELIST, VENUE_SORT_FALLBACK)).toThrow(ApiError);
    expect(() => parseSort('$secret', VENUE_SORT_WHITELIST, VENUE_SORT_FALLBACK)).toThrow(
      /not supported/
    );
  });

  it('rejects malformed date and time filters', () => {
    expect(listCourtsSchema.safeParse({ query: { date: '2026-4-1' } }).success).toBe(false);
    expect(listCourtsSchema.safeParse({ query: { time: '25:00' } }).success).toBe(false);
    expect(listCourtsSchema.safeParse({ query: { time: '09:75' } }).success).toBe(false);
    expect(
      listCourtsSchema.parse({ query: { date: '2026-04-01', time: '18:30' } }).query
    ).toMatchObject({ date: '2026-04-01', time: '18:30' });
  });
});
