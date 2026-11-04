import type { ProfileEntity } from '@app-types/profile.types.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import { ProfileRepository } from '@database/repositories/profile.repository.js';
import type { Profile } from '@database/schemas/profile.schema.js';
import { Injectable } from '@nestjs/common';

/** The fields of GhanaWorks `/api/v1/auth/me` that the social app keeps. */
export interface GhanaWorksIdentity {
  id: number | string;
  name?: string | null;
  image_url?: string | null;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly profiles: ProfileRepository) {}

  /**
   * Creates the profile on first login and refreshes the synced fields on
   * later ones. One atomic upsert on the unique `externalUserId`; if two
   * first logins race, the loser re-runs as a plain update.
   */
  async syncFromGhanaWorks(user: GhanaWorksIdentity): Promise<ProfileEntity> {
    const externalUserId = String(user.id);
    const synced: Partial<Profile> = {};
    if (user.name) synced.displayName = user.name;
    if (user.image_url) synced.avatarUrl = user.image_url;
    const update = { $set: synced };

    try {
      return await this.profiles.upsertByExternalUserId(externalUserId, update);
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) {
        throw error;
      }
      const profile = await this.profiles.updateByExternalUserId(
        externalUserId,
        update,
      );
      if (!profile) {
        throw error;
      }
      return profile;
    }
  }

  findByExternalUserId(externalUserId: string): Promise<ProfileEntity | null> {
    return this.profiles.findByExternalUserId(externalUserId);
  }

  findByExternalUserIds(externalUserIds: string[]): Promise<ProfileEntity[]> {
    return this.profiles.findByExternalUserIds(externalUserIds);
  }

  /** Invalidates every access token issued to the user before now. */
  async markLoggedOut(externalUserId: string): Promise<void> {
    await this.profiles.updateByExternalUserId(externalUserId, {
      $set: { loggedOutAt: new Date() },
    });
  }
}
