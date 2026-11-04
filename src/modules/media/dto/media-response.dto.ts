import { MediaStatus, MediaType } from '@app-types/media.types.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MediaResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  id: string;

  @ApiProperty({ enum: MediaType })
  mediaType: MediaType;

  @ApiProperty({ example: 'table.jpg' })
  fileName: string;

  @ApiProperty({ example: 'image/jpeg', description: 'Detected from the file' })
  mimeType: string;

  @ApiProperty({ description: 'Bytes' })
  size: number;

  @ApiProperty({ enum: MediaStatus })
  status: MediaStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uri',
    description: 'Null until the file is ready, or without a public URL',
  })
  fileUrl: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  thumbnailUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  width: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height: number | null;

  @ApiProperty({ type: Number, nullable: true })
  durationSeconds: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Safe message when status is failed',
  })
  failureReason: string | null;

  @ApiProperty({ description: 'The caller uploaded it' })
  isMine: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class MediaStatusResponseDto {
  @ApiProperty({ enum: MediaStatus })
  status: MediaStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  failureReason: string | null;
}

export class DeleteMediaResponseDto {
  @ApiProperty({ enum: [true] })
  deleted: true;
}
