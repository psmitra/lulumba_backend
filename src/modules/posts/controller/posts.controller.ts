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
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ListPostsQueryDto } from '../dto/list-posts-query.dto.js';
import { CreatePostDto, UpdatePostDto } from '../dto/post-input.dto.js';
import {
  DeletePostResponseDto,
  PostResponseDto,
} from '../dto/post-response.dto.js';
import { PostsService } from '../service/posts.service.js';

@ApiTags('posts')
@ApiErrorResponses(HttpStatus.TOO_MANY_REQUESTS)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a post',
    description:
      'Attach your own `ready` uploads. Send an `idempotencyKey` so a ' +
      'retried request never creates the post twice.',
  })
  @ApiSuccessResponse(PostResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.CONFLICT,
  )
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() input: CreatePostDto,
  ): Promise<ApiResponse<PostResponseDto>> {
    return successResponse(
      await this.postsService.create(auth.externalUserId, input),
      'Post created',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List / discover posts',
    description:
      'Newest first. Without `userId` only public posts are listed (this is ' +
      'not the home feed). With `userId`, followers-only posts are included ' +
      'when you follow that user.',
  })
  @ApiCursorPaginatedResponse(PostResponseDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListPostsQueryDto,
  ): Promise<ApiCursorResponse<PostResponseDto>> {
    const { items, meta } = await this.postsService.list(
      auth.externalUserId,
      query,
    );
    return cursorResponse(items, meta);
  }

  @Get(':postId')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Get one post',
    description:
      'Public posts work signed out. Followers-only posts need a token ' +
      'from the author or one of their followers.',
  })
  @ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(PostResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async findOne(
    @OptionalCurrentAuth() auth: AuthContext | undefined,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<PostResponseDto>> {
    return successResponse(
      await this.postsService.findOne(postId, auth?.externalUserId),
    );
  }

  @Patch(':postId')
  @ApiOperation({
    summary: 'Edit caption, visibility or attachment order',
    description:
      '`attachments` reorders or removes existing attachments only. Author ' +
      'only.',
  })
  @ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(PostResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Body() input: UpdatePostDto,
  ): Promise<ApiResponse<PostResponseDto>> {
    return successResponse(
      await this.postsService.update(postId, auth.externalUserId, input),
      'Post updated',
    );
  }

  @Delete(':postId')
  @ApiOperation({ summary: 'Delete a post (author only)' })
  @ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(DeletePostResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<DeletePostResponseDto>> {
    await this.postsService.remove(postId, auth.externalUserId);
    return successResponse({ deleted: true as const }, 'Post deleted');
  }
}
