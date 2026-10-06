import type { Page, PaginationInput, PaginationMeta } from '../types/pagination';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function paginationMeta({
  page,
  limit,
  total,
}: PaginationInput & { total: number }): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };
}

export function toPage<TItem>(items: TItem[], meta: PaginationMeta): Page<TItem> {
  return { items, meta };
}

export function skipFor({ page, limit }: PaginationInput): number {
  return (page - 1) * limit;
}

/**
 * Merges the canonical `meta` block with the legacy flat `{ page, limit, total }`
 * fields so existing clients keep working while new clients can rely on `meta`.
 */
export function withLegacyPagination<TItem>(
  page: Page<TItem>
): Page<TItem> & { total: number; page: number; limit: number } {
  return { ...page, total: page.meta.total, page: page.meta.page, limit: page.meta.limit };
}