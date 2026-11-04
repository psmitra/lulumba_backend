import { PostVisibility } from '@app-types/post.types.js';
import { Trim } from '@common/decorators/transform.decorators.js';
import { MAX_POST_ATTACHMENTS } from '@database/schemas/post.schema.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AttachmentInputDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  @IsMongoId()
  mediaId: string;

  @ApiProperty({ minimum: 0, example: 0, description: 'Display order' })
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder: number;
}

export class CreatePostDto {
  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiProperty({ enum: PostVisibility })
  @IsEnum(PostVisibility)
  visibility: PostVisibility;

  @ApiProperty({
    type: [AttachmentInputDto],
    minItems: 1,
    maxItems: MAX_POST_ATTACHMENTS,
    description: 'Your own uploads, in status `ready`',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_POST_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments: AttachmentInputDto[];

  @ApiPropertyOptional({
    maxLength: 128,
    description:
      'Any unique string per new post. Retrying with the same key returns ' +
      'the post already created instead of a duplicate.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}

export class UpdatePostDto {
  @ApiPropertyOptional({
    maxLength: 2200,
    description: 'Empty string clears it',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ enum: PostVisibility })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @ApiPropertyOptional({
    type: [AttachmentInputDto],
    minItems: 1,
    description:
      "The new order of the post's existing attachments. Leave one out to " +
      'remove it; new media cannot be added here.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_POST_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}
