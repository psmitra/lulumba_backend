import { ParseObjectIdPipe } from '@common/pipes/parse-object-id.pipe.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { CurrentAuth } from '@modules/auth/decorators/current-auth.decorator.js';
import type { AuthContext } from '@modules/auth/interfaces/auth-context.interface.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MediaType } from '@app-types/media.types.js';
import { CompleteUploadDto, UploadMediaDto } from '../dto/media-input.dto.js';
import { extensionsFor } from '../media.constants.js';
import {
  DeleteMediaResponseDto,
  MediaResponseDto,
  MediaStatusResponseDto,
} from '../dto/media-response.dto.js';
import { MediaService } from '../service/media.service.js';

@ApiTags('media')
@ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload an image, video or document',
    description:
      'Multipart upload. The real type is read from the file content and ' +
      'must be a supported `mediaType`; the file name only needs an ' +
      'extension of the same kind (a JPEG named `.png` is fine).\n\n' +
      `- **image**: ${extensionsFor(MediaType.Image).join(', ')}\n` +
      `- **video**: ${extensionsFor(MediaType.Video).join(', ')}\n` +
      `- **document**: ${extensionsFor(MediaType.Document).join(', ')}\n\n` +
      'Use the returned `id` as `mediaId` when creating a post.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'mediaType'],
      properties: {
        file: { type: 'string', format: 'binary' },
        mediaType: { type: 'string', enum: Object.values(MediaType) },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        durationSeconds: { type: 'integer', minimum: 0 },
      },
    },
  })
  @ApiSuccessResponse(MediaResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.PAYLOAD_TOO_LARGE,
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  async upload(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: UploadMediaDto,
  ): Promise<ApiResponse<MediaResponseDto>> {
    return successResponse(
      await this.mediaService.upload(auth.externalUserId, file, input),
      'Media uploaded',
    );
  }

  @Post(':mediaId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a presigned upload',
    description:
      'Checks the file exists in storage before marking it ready. Multipart ' +
      'uploads are already complete; calling this returns their state.',
  })
  @ApiParam({ name: 'mediaId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(MediaResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  async complete(
    @CurrentAuth() auth: AuthContext,
    @Param('mediaId', ParseObjectIdPipe) mediaId: string,
    @Body() input: CompleteUploadDto,
  ): Promise<ApiResponse<MediaResponseDto>> {
    return successResponse(
      await this.mediaService.complete(mediaId, auth.externalUserId, input),
    );
  }

  @Get(':mediaId')
  @ApiOperation({
    summary: 'Media details and URL',
    description: 'Yours, or shown on a post you are allowed to see.',
  })
  @ApiParam({ name: 'mediaId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(MediaResponseDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('mediaId', ParseObjectIdPipe) mediaId: string,
  ): Promise<ApiResponse<MediaResponseDto>> {
    return successResponse(
      await this.mediaService.findOne(mediaId, auth.externalUserId),
    );
  }

  @Get(':mediaId/status')
  @ApiOperation({ summary: 'Upload / processing status' })
  @ApiParam({ name: 'mediaId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(MediaStatusResponseDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async status(
    @CurrentAuth() auth: AuthContext,
    @Param('mediaId', ParseObjectIdPipe) mediaId: string,
  ): Promise<ApiResponse<MediaStatusResponseDto>> {
    return successResponse(
      await this.mediaService.status(mediaId, auth.externalUserId),
    );
  }

  @Delete(':mediaId')
  @ApiOperation({
    summary: 'Delete an unattached upload',
    description: 'Fails with 409 while a post shows it.',
  })
  @ApiParam({ name: 'mediaId', example: '665f1c2e8b3a4d0012ab34cd' })
  @ApiSuccessResponse(DeleteMediaResponseDto)
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('mediaId', ParseObjectIdPipe) mediaId: string,
  ): Promise<ApiResponse<DeleteMediaResponseDto>> {
    await this.mediaService.remove(mediaId, auth.externalUserId);
    return successResponse({ deleted: true as const }, 'Media deleted');
  }
}
