import { PaginationQueryDto } from '@common/dto/pagination-query.dto.js';
import type {
  ApiPaginatedResponse as PaginatedBody,
  ApiResponse,
} from '@common/response/response.interface.js';
import {
  paginatedResponse,
  successResponse,
} from '@common/response/response.util.js';
import {
  ApiErrorResponses,
  ApiPaginatedResponse,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { CurrentAuth } from '@modules/auth/decorators/current-auth.decorator.js';
import type { AuthContext } from '@modules/auth/interfaces/auth-context.interface.js';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  FollowListItemDto,
  FollowResponseDto,
  FollowStatsResponseDto,
} from '../dto/follow-response.dto.js';
import { UserIdParamDto } from '../dto/user-id-param.dto.js';
import { FollowService } from '../service/follow.service.js';

@ApiTags('follow')
@ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS)
@Controller('users/:userId')
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Post('follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user (idempotent)' })
  @ApiSuccessResponse(FollowResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async follow(
    @CurrentAuth() auth: AuthContext,
    @Param() { userId }: UserIdParamDto,
  ): Promise<ApiResponse<FollowResponseDto>> {
    const follow = await this.followService.follow(auth.externalUserId, userId);
    return successResponse(FollowResponseDto.fromEntity(follow), 'Following');
  }

  @Delete('follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unfollow a user (idempotent)' })
  @ApiNoContentResponse({ description: 'No longer following' })
  async unfollow(
    @CurrentAuth() auth: AuthContext,
    @Param() { userId }: UserIdParamDto,
  ): Promise<void> {
    await this.followService.unfollow(auth.externalUserId, userId);
  }

  @Get('followers')
  @ApiOperation({ summary: "A user's followers, newest first" })
  @ApiPaginatedResponse(FollowListItemDto)
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async followers(
    @CurrentAuth() auth: AuthContext,
    @Param() { userId }: UserIdParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedBody<FollowListItemDto>> {
    return paginatedResponse(
      await this.followService.listFollowers(
        auth.externalUserId,
        userId,
        query,
      ),
    );
  }

  @Get('following')
  @ApiOperation({ summary: 'Users a user follows, newest first' })
  @ApiPaginatedResponse(FollowListItemDto)
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async following(
    @CurrentAuth() auth: AuthContext,
    @Param() { userId }: UserIdParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedBody<FollowListItemDto>> {
    return paginatedResponse(
      await this.followService.listFollowing(
        auth.externalUserId,
        userId,
        query,
      ),
    );
  }

  @Get('follow-stats')
  @ApiOperation({ summary: 'Follower counts and relationship to the caller' })
  @ApiSuccessResponse(FollowStatsResponseDto)
  @ApiErrorResponses(HttpStatus.NOT_FOUND)
  async stats(
    @CurrentAuth() auth: AuthContext,
    @Param() { userId }: UserIdParamDto,
  ): Promise<ApiResponse<FollowStatsResponseDto>> {
    return successResponse(
      await this.followService.stats(auth.externalUserId, userId),
    );
  }
}
