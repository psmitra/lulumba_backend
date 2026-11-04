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
import {
  CommentBodyDto,
  ListCommentsQueryDto,
} from '../dto/comment-input.dto.js';
import {
  CommentResponseDto,
  DeleteCommentResponseDto,
  ReplyResponseDto,
} from '../dto/comment-response.dto.js';
import { CommentsService } from '../service/comments.service.js';

const EXAMPLE_ID = '665f1c2e8b3a4d0012ab34cd';
const DELETED = { deleted: true as const };

/** Comments on a post: /posts/{postId}/comments */
@ApiTags('comments')
@ApiParam({ name: 'postId', example: EXAMPLE_ID })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('posts/:postId/comments')
export class PostCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  @ApiOperation({ summary: 'Comment on a post' })
  @ApiSuccessResponse(CommentResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Body() { body }: CommentBodyDto,
  ): Promise<ApiResponse<CommentResponseDto>> {
    return successResponse(
      await this.comments.createComment(postId, auth.externalUserId, body),
      'Comment added',
    );
  }

  @Get()
  @OptionalAuth()
  @ApiOperation({
    summary: "A post's comments",
    description:
      'Top-level comments only, with `repliesCount`; fetch replies from ' +
      'GET /comments/{commentId}/replies. Public posts work signed out.',
  })
  @ApiCursorPaginatedResponse(CommentResponseDto)
  async list(
    @OptionalCurrentAuth() auth: AuthContext | undefined,
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Query() query: ListCommentsQueryDto,
  ): Promise<ApiCursorResponse<CommentResponseDto>> {
    const { items, meta } = await this.comments.listComments(
      postId,
      auth?.externalUserId,
      query,
    );
    return cursorResponse(items, meta);
  }
}

/** One comment, and its replies: /comments/{commentId} */
@ApiTags('comments')
@ApiParam({ name: 'commentId', example: EXAMPLE_ID })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('comments/:commentId')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Patch()
  @ApiOperation({ summary: 'Edit your comment' })
  @ApiSuccessResponse(CommentResponseDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @Body() { body }: CommentBodyDto,
  ): Promise<ApiResponse<CommentResponseDto>> {
    return successResponse(
      await this.comments.updateComment(commentId, auth.externalUserId, body),
      'Comment updated',
    );
  }

  @Delete()
  @ApiOperation({
    summary: 'Delete your comment',
    description:
      'Replies are kept: a comment with replies stays in the list as ' +
      '`isDeleted: true` without author or body.',
  })
  @ApiSuccessResponse(DeleteCommentResponseDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
  ): Promise<ApiResponse<DeleteCommentResponseDto>> {
    await this.comments.deleteComment(commentId, auth.externalUserId);
    return successResponse(DELETED, 'Comment deleted');
  }

  @Post('replies')
  @ApiOperation({ summary: 'Reply to a comment (one level deep)' })
  @ApiSuccessResponse(ReplyResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async reply(
    @CurrentAuth() auth: AuthContext,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @Body() { body }: CommentBodyDto,
  ): Promise<ApiResponse<ReplyResponseDto>> {
    return successResponse(
      await this.comments.createReply(commentId, auth.externalUserId, body),
      'Reply added',
    );
  }

  @Get('replies')
  @OptionalAuth()
  @ApiOperation({ summary: "A comment's replies, oldest first" })
  @ApiCursorPaginatedResponse(ReplyResponseDto)
  async replies(
    @OptionalCurrentAuth() auth: AuthContext | undefined,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ApiCursorResponse<ReplyResponseDto>> {
    const { items, meta } = await this.comments.listReplies(
      commentId,
      auth?.externalUserId,
      query,
    );
    return cursorResponse(items, meta);
  }
}

/** One reply: /replies/{replyId} */
@ApiTags('comments')
@ApiParam({ name: 'replyId', example: EXAMPLE_ID })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('replies/:replyId')
export class RepliesController {
  constructor(private readonly comments: CommentsService) {}

  @Patch()
  @ApiOperation({ summary: 'Edit your reply' })
  @ApiSuccessResponse(ReplyResponseDto)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('replyId', ParseObjectIdPipe) replyId: string,
    @Body() { body }: CommentBodyDto,
  ): Promise<ApiResponse<ReplyResponseDto>> {
    return successResponse(
      await this.comments.updateReply(replyId, auth.externalUserId, body),
      'Reply updated',
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Delete your reply' })
  @ApiSuccessResponse(DeleteCommentResponseDto)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('replyId', ParseObjectIdPipe) replyId: string,
  ): Promise<ApiResponse<DeleteCommentResponseDto>> {
    await this.comments.deleteReply(replyId, auth.externalUserId);
    return successResponse(DELETED, 'Reply deleted');
  }
}
