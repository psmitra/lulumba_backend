import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../constants/pagination.constants.js';
import type {
  PaginatedResult,
  PaginationMeta,
} from '../interfaces/pagination.interface.js';

export interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
}

/** Clamps page/limit into safe bounds and derives the skip offset. */
export function normalizePagination(
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_PAGE_LIMIT,
): NormalizedPagination {
  const safePage = Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE;
  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? Math.min(limit, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT;

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function mapPaginatedResult<TSource, TTarget>(
  result: PaginatedResult<TSource>,
  mapper: (item: TSource) => TTarget,
): PaginatedResult<TTarget> {
  return { ...result, items: result.items.map(mapper) };
}
