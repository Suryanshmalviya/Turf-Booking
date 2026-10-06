import { Types } from 'mongoose';

import { ApiError } from './api-error';

/** Escapes user input before embedding it in a case-insensitive RegExp filter. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function exactRegex(value: string, flags = 'i'): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, flags);
}

export function containsRegex(value: string, flags = 'i'): RegExp {
  return new RegExp(escapeRegex(value), flags);
}

export function toObjectId(value: string, field = 'id'): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw ApiError.badRequest(`${field} is not a valid id`);
  return new Types.ObjectId(value);
}

export function objectIdFilter(value: string, field = 'id') {
  return { [field]: toObjectId(value, field) };
}
