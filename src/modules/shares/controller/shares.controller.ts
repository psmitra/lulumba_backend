import { ParseObjectIdPipe } from '@common/pipes/parse-object-id.pipe.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { CurrentAuth } from '@modules/auth/decorators/current-auth.decorator.js';
import {
  OptionalAuth,
  OptionalCurrentAuth,
} from '@modules/auth/decorators/optional-auth.decorator.js';
import type { AuthContext } from '@modules/auth/interfaces/auth-context.interface.js';
import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreateShareDto,
  ShareLinkResponseDto,
  ShareResponseDto,
} from '../dto/share.dto.js';
import { SharesService } from '../service/shares.service.js';

@ApiTags('shares')
@ApiParam({ name: 'postId', example: '665f1c2e8b3a4d0012ab34cd' })
@ApiErrorResponses(
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
)
@Controller('posts/:postId')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Post('shares')
  @ApiOperation({
    summary: 'Record a share',
    description:
      'Call after the user shares: `internal` sends the post to another ' +
      'user; `copy_link` / `external` record use of the link or the ' +
      'device share sheet. Repeats are recorded but counted once.',
  })
  @ApiSuccessResponse(ShareResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async share(
    @CurrentAuth() auth: AuthContext,
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Body() input: CreateShareDto,
  ): Promise<ApiResponse<ShareResponseDto>> {
    return successResponse(
      await this.sharesService.share(postId, auth.externalUserId, input),
      'Shared',
    );
  }

  @Get('share-link')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Canonical share URL',
    description:
      'Public posts work signed out. The link itself grants nothing: ' +
      'opening it still applies the post visibility rules.',
  })
  @ApiSuccessResponse(ShareLinkResponseDto)
  async link(
    @OptionalCurrentAuth() auth: AuthContext | undefined,
    @Param('postId', ParseObjectIdPipe) postId: string,
  ): Promise<ApiResponse<ShareLinkResponseDto>> {
    return successResponse(
      await this.sharesService.link(postId, auth?.externalUserId),
    );
  }
}
