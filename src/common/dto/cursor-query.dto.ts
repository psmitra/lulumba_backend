import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEFAULT_CURSOR_LIMIT,
  MAX_CURSOR_LIMIT,
} from '../constants/pagination.constants.js';

/** Base for feed-style lists: `?limit=20&cursor=<meta.nextCursor>`. */
export class CursorQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_CURSOR_LIMIT,
    default: DEFAULT_CURSOR_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CURSOR_LIMIT)
  limit: number = DEFAULT_CURSOR_LIMIT;

  @ApiPropertyOptional({
    description: '`meta.nextCursor` of the previous page',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
