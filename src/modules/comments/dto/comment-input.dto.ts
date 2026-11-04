import { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import { Trim } from '@common/decorators/transform.decorators.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export const MAX_COMMENT_LENGTH = 2000;

/** Body of a new or edited comment or reply. */
export class CommentBodyDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_COMMENT_LENGTH })
  @Trim()
  @IsString()
  @Length(1, MAX_COMMENT_LENGTH)
  body: string;
}

export enum CommentSort {
  Oldest = 'oldest',
  Newest = 'newest',
}

export class ListCommentsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: CommentSort, default: CommentSort.Oldest })
  @IsOptional()
  @IsEnum(CommentSort)
  sort: CommentSort = CommentSort.Oldest;
}
