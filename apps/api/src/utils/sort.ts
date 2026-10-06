import type { SortSpec } from '../types/pagination';
import { ApiError } from './api-error';

export interface SortWhitelist {
  [field: string]: 1 | -1;
}

/**
 * Parses a `?sort=-createdAt,name` query value into a Mongo sort specification.
 * Only whitelisted fields are accepted, which removes sort injection as a class
 * of query-manipulation bug.
 */
export function parseSort(
  raw: string | undefined,
  whitelist: SortWhitelist,
  fallback: SortSpec
): SortSpec {
  if (!raw) return fallback;
  const spec: SortSpec = {};
  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const descending = trimmed.startsWith('-');
    const field = descending ? trimmed.slice(1) : trimmed;
    if (!Object.prototype.hasOwnProperty.call(whitelist, field)) {
      throw ApiError.badRequest(
        `sort field "${field}" is not supported`,
        Object.keys(whitelist)
      );
    }
    spec[field] = descending ? -1 : 1;
  }
  return Object.keys(spec).length > 0 ? spec : fallback;
}