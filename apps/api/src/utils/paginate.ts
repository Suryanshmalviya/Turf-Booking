import type { Document, FilterQuery, Model } from 'mongoose';

import type { PageResult, SortSpec } from '../types/pagination';
import { paginationMeta, skipFor } from './pagination';

export interface PaginateOptions {
  page: number;
  limit: number;
  sort?: SortSpec;
  select?: string;
}

async function runPageQuery<TDoc extends Document, TResult>(
  model: Model<TDoc>,
  filter: FilterQuery<TDoc>,
  { page, limit, sort, select }: PaginateOptions
): Promise<TResult[]> {
  const query = model.find(filter).skip(skipFor({ page, limit })).limit(limit);
  if (select !== undefined) query.select(select);
  if (sort !== undefined) query.sort(sort);

  const rows = await query.lean<TResult>().exec();
  return rows as TResult[];
}

/**
 * Shared pagination executor used by every list endpoint so `page`, `limit`,
 * sorting, projection and total counts behave identically across modules.
 */
export async function paginate<TDoc extends Document, TResult = Record<string, unknown>>(
  model: Model<TDoc>,
  filter: FilterQuery<TDoc>,
  options: PaginateOptions
): Promise<PageResult<TResult>> {
  const [items, total] = await Promise.all([
    runPageQuery<TDoc, TResult>(model, filter, options),
    model.countDocuments(filter),
  ]);

  return { items, total };
}

/** Convenience wrapper returning the response-ready `{ items, meta }` shape. */
export async function paginateWithMeta<TDoc extends Document, TResult = Record<string, unknown>>(
  model: Model<TDoc>,
  filter: FilterQuery<TDoc>,
  options: PaginateOptions
): Promise<{ items: TResult[]; meta: ReturnType<typeof paginationMeta> }> {
  const { items, total } = await paginate<TDoc, TResult>(model, filter, options);
  return { items, meta: paginationMeta({ page: options.page, limit: options.limit, total }) };
}
