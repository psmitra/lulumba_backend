import { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostTypeFilter } from '../posts.constants.js';

export class ListPostsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: PostTypeFilter })
  @IsOptional()
  @IsEnum(PostTypeFilter)
  type?: PostTypeFilter;

  @ApiPropertyOptional({
    description: "Only this user's posts (GhanaWorks id)",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId?: string;
}
