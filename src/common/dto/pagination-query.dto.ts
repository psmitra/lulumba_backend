import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../constants/pagination.constants.js';

/** Base for list endpoints: `?page=1&limit=20`. Extend to add filters. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;
}
