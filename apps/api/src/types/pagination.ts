export type SortOrder = 1 | -1;

/** Mongo sort specification restricted to whitelisted fields. */
export type SortSpec = Record<string, SortOrder>;

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginationMeta extends PaginationInput {
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Page<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}

export interface PageResult<TItem> {
  items: TItem[];
  total: number;
}

export interface DateRangeQuery {
  from: Date;
  to: Date;
}
