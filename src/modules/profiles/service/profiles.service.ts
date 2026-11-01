import type { LeanDocument } from '@common/repository/base.repository.js';
import { isDuplicateKeyError } from '@common/utils/mongo-error.util.js';
import { Profile } from '@database/schemas/profile.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

/** The fields of GhanaWorks `/api/v1/auth/me` that the social app keeps. */
export interface GhanaWorksIdentity {
  id: number | string;
  name?: string | null;
  image_url?: string | null;
}

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<Profile>,
  ) {}

  /**
   * Creates the profile on first login and refreshes the synced fields on
   * later ones. One atomic upsert on the unique `externalUserId`; if two
   * first logins race, the loser re-runs as a plain update.
   */
  async syncFromGhanaWorks(
    user: GhanaWorksIdentity,
  ): Promise<LeanDocument<Profile>> {
    const externalUserId = String(user.id);
    const filter = { externalUserId };
    const synced: Partial<Profile> = {};
    if (user.name) synced.displayName = user.name;
    if (user.image_url) synced.avatarUrl = user.image_url;
    const update = { $set: synced };

    try {
      return await this.profileModel
        .findOneAndUpdate(filter, update, {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        })
        .lean()
        .orFail()
        .exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      return this.profileModel
        .findOneAndUpdate(filter, update, { returnDocument: 'after' })
        .lean()
        .orFail()
        .exec();
    }
  }

  findByExternalUserId(
    externalUserId: string,
  ): Promise<LeanDocument<Profile> | null> {
    return this.profileModel.findOne({ externalUserId }).lean().exec();
  }

  /** Invalidates every access token issued to the user before now. */
  async markLoggedOut(externalUserId: string): Promise<void> {
    await this.profileModel.updateOne(
      { externalUserId },
      { $set: { loggedOutAt: new Date() } },
    );
  }
}
