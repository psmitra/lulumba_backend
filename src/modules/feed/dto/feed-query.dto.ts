import { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import { PostTypeFilter } from '@modules/posts/posts.constants.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FeedSort } from '../feed.constants.js';

/** GET /feed/home and /feed/recommended: `?limit=&cursor=`. */
export class FeedQueryDto extends CursorQueryDto {}

export class LatestFeedQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: PostTypeFilter })
  @IsOptional()
  @IsEnum(PostTypeFilter)
  type?: PostTypeFilter;
}

/** Videos / Pictures / Scripts sections. */
export class SectionFeedQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: FeedSort,
    default: FeedSort.Latest,
    description:
      '`latest`: newest first. `popular`: ranked by engagement and ' +
      'freshness over the last 30 days. A cursor only works with the sort ' +
      'that issued it.',
  })
  @IsOptional()
  @IsEnum(FeedSort)
  sort: FeedSort = FeedSort.Latest;
}
