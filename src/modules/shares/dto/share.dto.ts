import { ShareType } from '@app-types/share.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateShareDto {
  @ApiProperty({
    enum: ShareType,
    description:
      '`internal`: send to a Lulumba user. `copy_link` / `external`: the ' +
      'app copied the link or opened the device share sheet.',
  })
  @IsEnum(ShareType)
  shareType: ShareType;

  @ApiPropertyOptional({
    description: 'GhanaWorks user id; required for `internal`, else omitted',
    example: '5002',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientUserId?: string;
}

export class ShareResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  shareId: string;

  @ApiProperty({
    example: 'https://lulumba.app/posts/665f1c2e8b3a4d0012ab34ce',
  })
  shareUrl: string;

  @ApiProperty({ type: String, format: 'date-time' })
  sharedAt: Date;

  @ApiProperty({ example: 4, description: "The post's share count now" })
  sharesCount: number;
}

export class ShareLinkResponseDto {
  @ApiProperty({
    example: 'https://lulumba.app/posts/665f1c2e8b3a4d0012ab34ce',
  })
  shareUrl: string;

  @ApiProperty({
    enum: PostVisibility,
    description:
      'Who can open the link: followers-only posts still need the viewer ' +
      'to sign in and follow the author.',
  })
  visibility: PostVisibility;
}
