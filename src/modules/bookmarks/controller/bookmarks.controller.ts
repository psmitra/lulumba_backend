import { ParseObjectIdPipe } from '@common/pipes/parse-object-id.pipe.js';
import type {
  ApiCursorResponse,
  ApiResponse,
} from '@common/response/response.interface.js';
import {
  cursorResponse,
  successResponse,
} from '@common/response/response.util.js';
import {
  ApiCursorPaginatedResponse,
  ApiErrorResponses,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { CurrentAuth } from '@modules/auth/decorators/current-auth.decorator.js';
import type { AuthContext } from '@modules/auth/interfaces/auth-context.interface.js';
import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  BookmarkItemDto,
  BookmarkStateDto,
  ListBookmarksQueryDto,
} from '../dto/bookmark.dto.js';
import { BookmarksService } from '../service/bookmarks.service.js';

/** Save / unsave: /posts/{postId}/bookmark */
@ApiTags('shortlist')
@ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('posts/:postId/bookmark')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Put()
  @ApiOperation({ summary: 'Save a post to your Shortlist (idempotent)' })
  @ApiSuccessResponse(BookmarkStateDto)
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async save(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<BookmarkStateDto>> {
    return successResponse(
      await this.bookmarks.save(postId, auth.externalUserId),
      'Saved',
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Remove a post from your Shortlist (idempotent)' })
  @ApiSuccessResponse(BookmarkStateDto)
  async unsave(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<BookmarkStateDto>> {
    return successResponse(
      await this.bookmarks.unsave(postId, auth.externalUserId),
      'Removed',
    );
  }
}

/** The caller's Shortlist: /users/me/bookmarks */
@ApiTags('shortlist')
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('users/me/bookmarks')
export class ShortlistController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  @ApiOperation({
    summary: 'Your Shortlist, newest saves first',
    description:
      'Private to you. Deleted posts and posts you can no longer see are ' +
      'left out.',
  })
  @ApiCursorPaginatedResponse(BookmarkItemDto)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListBookmarksQueryDto,
  ): Promise<ApiCursorResponse<BookmarkItemDto>> {
    const { items, meta } = await this.bookmarks.list(
      auth.externalUserId,
      query,
    );
    return cursorResponse(items, meta);
  }
}
