import { z } from 'zod';

import { config } from '../config';
import { USER_ROLES, USER_STATUSES } from '../types/enums';
import { isIanaTimezone } from '../utils/timezone';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code');

export const timezoneSchema = z.string().refine(isIanaTimezone, 'Must be a valid IANA timezone');

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD');

export const timeKeySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must use a 24-hour HH:mm time');

export const idempotencyKeySchema = z.string().trim().min(8).max(200);

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});

/** Standard page/limit block shared by every list endpoint. */
export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(config.pagination.maxLimit)
    .default(config.pagination.defaultLimit),
};

export function paginatedQuery<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object({ ...paginationSchema, ...shape });
}

export const paginationInputSchema = z.object(paginationSchema);

export const sortSchema = z.string().trim().max(120).optional();

export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine(value => value.to >= value.from, { message: 'to must be on or after from' });

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value), {
    message: 'Password must contain upper and lower case characters',
  });

export type PaginationQuery = z.infer<typeof paginationInputSchema>;
