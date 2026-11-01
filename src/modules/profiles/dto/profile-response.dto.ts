import type { LeanDocument } from '@common/repository/base.repository.js';
import type { Profile } from '@database/schemas/profile.schema.js';

export class ProfileResponseDto {
  id: string;
  /** GhanaWorks user id. */
  externalUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: Date;

  static fromDocument(doc: LeanDocument<Profile>): ProfileResponseDto {
    const dto = new ProfileResponseDto();
    dto.id = doc._id.toString();
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
