import type { PaginationMeta } from '../interfaces/pagination.interface.js';

export interface ApiResponse<TData, TMeta = null> {
  success: true;
  message: string;
  data: TData;
  meta: TMeta;
}

export type ApiPaginatedResponse<TItem> = ApiResponse<TItem[], PaginationMeta>;

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    statusCode: number;
    code: string;
    details?: ApiErrorDetail[];
    path: string;
    timestamp: string;
  };
}
