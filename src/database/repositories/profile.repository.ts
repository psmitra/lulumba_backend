import type { ProfileEntity } from '@app-types/profile.types.js';
import { Profile } from '@database/schemas/profile.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, UpdateQuery } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class ProfileRepository extends BaseCrudRepository<
  Profile,
  ProfileEntity
> {
  constructor(@InjectModel(Profile.name) model: Model<Profile>) {
    super(model);
  }

  findByExternalUserId(externalUserId: string): Promise<ProfileEntity | null> {
    return this.findOne({ externalUserId });
  }

  /** One query for a page of users; order is not preserved. */
  findByExternalUserIds(externalUserIds: string[]): Promise<ProfileEntity[]> {
    if (externalUserIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.findAll({ externalUserId: { $in: externalUserIds } });
  }

  findByUsername(username: string): Promise<ProfileEntity | null> {
    return this.findOne({ username: username.toLowerCase() });
  }

  /**
   * Creates the profile or updates it, keyed on `externalUserId`. Throws
   * DuplicateKeyError when two first-time upserts race; retry with
   * `updateByExternalUserId`.
   */
  async upsertByExternalUserId(
    externalUserId: string,
    update: UpdateQuery<Profile>,
  ): Promise<ProfileEntity> {
    const profile = await this.findOneAndUpdateWhere(
      { externalUserId },
      update,
      { upsert: true },
    );
    // An upsert always returns a document.
    return profile!;
  }

  updateByExternalUserId(
    externalUserId: string,
    update: UpdateQuery<Profile>,
  ): Promise<ProfileEntity | null> {
    return this.findOneAndUpdateWhere({ externalUserId }, update);
  }

  protected toEntity(document: LeanDocument<Profile>): ProfileEntity {
    return toPlainEntity(document);
  }
}
