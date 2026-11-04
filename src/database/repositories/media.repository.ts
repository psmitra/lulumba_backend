import type { MediaEntity } from '@app-types/media.types.js';
import { MediaStatus, MediaVariant } from '@app-types/media.types.js';
import { Media } from '@database/schemas/media.schema.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class MediaRepository extends BaseCrudRepository<Media, MediaEntity> {
  constructor(@InjectModel(Media.name) model: Model<Media>) {
    super(model);
  }

  /** Media owned by `ownerId` and not soft-deleted. */
  findOwnedById(id: string, ownerId: string): Promise<MediaEntity | null> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(null);
    }
    return this.findOne({ _id: id, ownerId, deletedAt: null });
  }

  /** The ready, owned subset of `ids`, e.g. to validate post attachments. */
  findReadyOwnedByIds(ids: string[], ownerId: string): Promise<MediaEntity[]> {
    return this.findAll({
      _id: { $in: ids.filter(isValidObjectId) },
      ownerId,
      status: MediaStatus.Ready,
      deletedAt: null,
    });
  }

  /** Active media among `ids`, any status (e.g. to render attachments). */
  findActiveByIds(ids: string[]): Promise<MediaEntity[]> {
    const validIds = ids.filter(isValidObjectId);
    if (validIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.findAll({ _id: { $in: validIds }, deletedAt: null });
  }

  /** A derived file of an original, e.g. its watermarked copy. */
  findDerivative(
    sourceMediaId: string,
    variant: MediaVariant,
  ): Promise<MediaEntity | null> {
    if (!isValidObjectId(sourceMediaId)) {
      return Promise.resolve(null);
    }
    return this.findOne({
      sourceMediaId: new Types.ObjectId(sourceMediaId),
      variant,
      deletedAt: null,
    });
  }

  findActiveById(id: string): Promise<MediaEntity | null> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(null);
    }
    return this.findOne({ _id: id, deletedAt: null });
  }

  /** Bytes used by the owner's active uploads, for the storage quota. */
  async totalBytesFor(ownerId: string): Promise<number> {
    const [result] = await this.model.aggregate<{ total: number }>([
      { $match: { ownerId, deletedAt: null } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]);
    return result?.total ?? 0;
  }

  /**
   * Moves a pending upload on once its file is confirmed in storage.
   * Conditional on `pending`, so completing twice changes nothing.
   */
  markUploaded(
    id: string,
    ownerId: string,
    status: MediaStatus,
    checksum?: string,
  ): Promise<MediaEntity | null> {
    return this.findOneAndUpdateWhere(
      { _id: id, ownerId, status: MediaStatus.Pending, deletedAt: null },
      { $set: { status, ...(checksum ? { checksum } : {}) } },
    );
  }

  /** Resolves to true when owned, active media was soft-deleted. */
  softDelete(id: string, ownerId: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(false);
    }
    return this.updateOneWhere(
      { _id: id, ownerId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }

  protected toEntity(document: LeanDocument<Media>): MediaEntity {
    return toPlainEntity(document);
  }
}
