// Framework-free types: safe to import from domain layers.

export type SortDirection = 'asc' | 'desc';

export interface SortOption<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

export interface PaginationOptions<TSortField extends string = string> {
  page: number;
  limit: number;
  sort?: SortOption<TSortField>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> extends PaginationMeta {
  items: T[];
}
