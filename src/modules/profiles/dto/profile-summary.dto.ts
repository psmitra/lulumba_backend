import type { ProfileEntity } from '@app-types/profile.types.js';
import { ApiProperty } from '@nestjs/swagger';

/** The basics shown wherever a user appears in a list. */
export class ProfileSummaryDto {
  /** GhanaWorks user id: use it in `/users/:userId/...` routes. */
  @ApiProperty({ description: 'GhanaWorks user id', example: '5001' })
  userId: string;

  @ApiProperty({ type: String, nullable: true, example: 'kofi.asante' })
  username: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Kofi Asante' })
  displayName: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  avatarUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio: string | null;

  static fromEntity(this: void, profile: ProfileEntity): ProfileSummaryDto {
    const dto = new ProfileSummaryDto();
    dto.userId = profile.externalUserId;
    dto.username = profile.username ?? null;
    dto.displayName = profile.displayName ?? null;
    dto.avatarUrl = profile.avatarUrl ?? null;
    dto.bio = profile.bio ?? null;
    return dto;
  }
}
