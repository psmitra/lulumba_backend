import { MediaType } from '@app-types/media.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ApiProperty } from '@nestjs/swagger';

export class AttachmentResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  mediaId: string;

  @ApiProperty({ enum: MediaType })
  mediaType: MediaType;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  url: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  thumbnailUrl: string | null;

  @ApiProperty({ example: 'image/webp' })
  mimeType: string;

  @ApiProperty({ description: 'Shown as the download name of documents' })
  fileName: string;

  @ApiProperty({ description: 'Bytes' })
  size: number;

  @ApiProperty({ type: Number, nullable: true })
  width: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height: number | null;

  @ApiProperty({ type: Number, nullable: true })
  durationSeconds: number | null;
}

export class PostResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  id: string;

  @ApiProperty({ type: ProfileSummaryDto })
  author: ProfileSummaryDto;

  @ApiProperty({ type: String, nullable: true })
  caption: string | null;

  @ApiProperty({ enum: PostVisibility })
  visibility: PostVisibility;

  @ApiProperty({ type: [AttachmentResponseDto] })
  attachments: AttachmentResponseDto[];

  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  commentsCount: number;

  @ApiProperty()
  sharesCount: number;

  @ApiProperty({ description: 'The caller liked it (false when signed out)' })
  isLiked: boolean;

  @ApiProperty({ description: 'The caller saved it (false when signed out)' })
  isSaved: boolean;

  @ApiProperty({ description: 'The caller wrote it' })
  isMine: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class DeletePostResponseDto {
  @ApiProperty({ enum: [true] })
  deleted: true;
}
