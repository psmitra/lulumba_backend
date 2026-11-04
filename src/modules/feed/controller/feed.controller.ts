import type { ApiCursorResponse } from '@common/response/response.interface.js';
import { cursorResponse } from '@common/response/response.util.js';
import {
  ApiCursorPaginatedResponse,
  ApiErrorResponses,
} from '@common/swagger/swagger.decorators.js';
import { CurrentAuth } from '@modules/auth/decorators/current-auth.decorator.js';
import type { AuthContext } from '@modules/auth/interfaces/auth-context.interface.js';
import { PostResponseDto } from '@modules/posts/dto/post-response.dto.js';
import { PostTypeFilter } from '@modules/posts/posts.constants.js';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  FeedQueryDto,
  LatestFeedQueryDto,
  SectionFeedQueryDto,
} from '../dto/feed-query.dto.js';
import { FeedService, type FeedPage } from '../service/feed.service.js';

const RANKED_NOTE =
  ' Ranked once on the first page; pass `meta.nextCursor` back for the ' +
  'next one. A cursor lasts 30 minutes, after which it is 410 and the app ' +
  'should reload from the first page.';

@ApiTags('feed')
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('home')
  @ApiOperation({
    summary: 'Home feed: people you follow, ranked',
    description:
      'Posts from people you follow and your own, ranked by engagement, ' +
      'how often you interact with the author, and freshness. Your posts ' +
      'from the last hour come first; every 5th post is a popular post ' +
      "from someone you don't follow." +
      RANKED_NOTE,
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.GONE)
  async home(
    @CurrentAuth() auth: AuthContext,
    @Query() query: FeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(await this.feed.home(auth.externalUserId, query));
  }

  @Get('latest')
  @ApiOperation({
    summary: 'Latest posts you may see, newest first',
    description:
      'Public posts, plus followers-only posts of people you follow.',
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  async latest(
    @CurrentAuth() auth: AuthContext,
    @Query() query: LatestFeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(await this.feed.latest(auth.externalUserId, query));
  }

  @Get('recommended')
  @ApiOperation({
    summary: "Recommended: popular posts from people you don't follow",
    description:
      'Public posts from the last 7 days, ranked by engagement and ' +
      'freshness.' +
      RANKED_NOTE,
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.GONE)
  async recommended(
    @CurrentAuth() auth: AuthContext,
    @Query() query: FeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(await this.feed.recommended(auth.externalUserId, query));
  }

  @Get('videos')
  @ApiOperation({
    summary: 'Videos section',
    description: 'Posts with at least one ready (playable) video.',
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.GONE)
  async videos(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SectionFeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(
      await this.feed.section(auth.externalUserId, PostTypeFilter.Video, query),
    );
  }

  @Get('pictures')
  @ApiOperation({
    summary: 'Pictures section',
    description: 'Posts with at least one ready photo.',
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.GONE)
  async pictures(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SectionFeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(
      await this.feed.section(auth.externalUserId, PostTypeFilter.Photo, query),
    );
  }

  @Get('documents')
  @ApiOperation({
    summary: 'Scripts section (documents)',
    description: 'Posts with at least one ready document.',
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.GONE)
  async documents(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SectionFeedQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    return page(
      await this.feed.section(
        auth.externalUserId,
        PostTypeFilter.Document,
        query,
      ),
    );
  }
}

function page({ items, meta }: FeedPage): ApiCursorResponse<PostResponseDto> {
  return cursorResponse(items, meta);
}
