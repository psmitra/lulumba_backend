import { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
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
import {
  OptionalAuth,
  OptionalCurrentAuth,
} from '@modules/auth/decorators/optional-auth.decorator.js';
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
import { LikerDto, LikeStateDto } from '../dto/like-response.dto.js';
import { LikesService } from '../service/likes.service.js';

@ApiTags('likes')
@ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('posts/:postId')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Put('like')
  @ApiOperation({
    summary: 'Like a post (idempotent)',
    description: 'Liking twice keeps one like and the same count.',
  })
  @ApiSuccessResponse(LikeStateDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async like(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<LikeStateDto>> {
    return successResponse(
      await this.likesService.like(postId, auth.externalUserId),
      'Liked',
    );
  }

  @Delete('like')
  @ApiOperation({ summary: 'Remove your like (idempotent)' })
  @ApiSuccessResponse(LikeStateDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async unlike(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<LikeStateDto>> {
    return successResponse(
      await this.likesService.unlike(postId, auth.externalUserId),
      'Like removed',
    );
  }

  @Get('likes')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Users who liked a post, newest first',
    description:
      'Public posts work signed out; followers-only posts need a token from ' +
      'someone who may see the post.',
  })
  @ApiCursorPaginatedResponse(LikerDto)
  async list(
    @OptionalCurrentAuth() auth: AuthContext | undefined,
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ApiCursorResponse<LikerDto>> {
    const { items, meta } = await this.likesService.list(
      postId,
      auth?.externalUserId,
      query,
    );
    return cursorResponse(items, meta);
  }
}
