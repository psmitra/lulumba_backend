import type { PaginatedResult } from '../interfaces/pagination.interface.js';
import type {
  ApiCursorResponse,
  ApiPaginatedResponse,
  ApiResponse,
  CursorMeta,
} from './response.interface.js';

// Controllers wrap their results with these helpers. There is deliberately no
// response-wrapping interceptor, so a payload can never be wrapped twice.
// Errors are shaped by AllExceptionsFilter, never by these helpers.

export function successResponse<TData>(
  data: TData,
  message = 'Request successful',
): ApiResponse<TData> {
  return { success: true, message, data, meta: null };
}

export function paginatedResponse<TItem>(
  result: PaginatedResult<TItem>,
  message = 'Request successful',
): ApiPaginatedResponse<TItem> {
  const { items, page, limit, total, totalPages } = result;
  return {
    success: true,
    message,
    data: items,
    meta: { page, limit, total, totalPages },
  };
}

export function cursorResponse<TItem>(
  items: TItem[],
  meta: CursorMeta,
  message = 'Request successful',
): ApiCursorResponse<TItem> {
  return { success: true, message, data: items, meta };
}
