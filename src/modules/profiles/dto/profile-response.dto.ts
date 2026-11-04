import type { ProfileEntity } from '@app-types/profile.types.js';
import { ApiProperty } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: '665f1c2e8b3a4d0012ab34cd' })
  id: string;

  /** GhanaWorks user id. */
  @ApiProperty({ description: 'GhanaWorks user id' })
  externalUserId: string;

  @ApiProperty({ type: String, nullable: true, example: 'ama_k' })
  username: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Ama Kumi' })
  displayName: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  avatarUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(doc: ProfileEntity): ProfileResponseDto {
    const dto = new ProfileResponseDto();
    dto.id = doc.id;
    dto.externalUserId = doc.externalUserId;
    dto.username = doc.username ?? null;
    dto.displayName = doc.displayName ?? null;
    dto.avatarUrl = doc.avatarUrl ?? null;
    dto.bio = doc.bio ?? null;
    dto.isActive = doc.isActive;
    dto.createdAt = doc.createdAt;
    return dto;
  }
}
