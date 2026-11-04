import { MediaType } from '@app-types/media.types.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Text fields of the multipart upload, next to `file`. */
export class UploadMediaDto {
  @ApiProperty({
    enum: MediaType,
    description: 'Must match the actual file content',
  })
  @IsEnum(MediaType)
  mediaType: MediaType;

  // Optional display hints from the client (e.g. from the picker).
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  width?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  height?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Videos only' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  durationSeconds?: number;
}

export class CompleteUploadDto {
  @ApiPropertyOptional({ description: 'SHA-256 of the file, hex' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, { message: 'checksum must be a SHA-256 hex' })
  checksum?: string;
}
