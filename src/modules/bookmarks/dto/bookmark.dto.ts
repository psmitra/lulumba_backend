import { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import { PostResponseDto } from '@modules/posts/dto/post-response.dto.js';
import { PostTypeFilter } from '@modules/posts/posts.constants.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class BookmarkStateDto {
  @ApiProperty()
  saved: boolean;
}

export class ListBookmarksQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: PostTypeFilter })
  @IsOptional()
  @IsEnum(PostTypeFilter)
  type?: PostTypeFilter;
}

export class BookmarkItemDto {
  @ApiProperty({ type: PostResponseDto })
  post: PostResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  savedAt: Date;
}
