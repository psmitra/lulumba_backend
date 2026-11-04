import type { FeedSnapshotEntity } from '@app-types/feed-snapshot.types.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { FeedSnapshot } from '@database/schemas/feed-snapshot.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class FeedSnapshotRepository extends BaseCrudRepository<
  FeedSnapshot,
  FeedSnapshotEntity
> {
  constructor(@InjectModel(FeedSnapshot.name) model: Model<FeedSnapshot>) {
    super(model);
  }

  /** The viewer's unexpired snapshot of `feed`, or null. */
  findLive(
    id: string,
    userId: string,
    feed: string,
  ): Promise<FeedSnapshotEntity | null> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(null);
    }
    return this.findOne({
      _id: id,
      userId,
      feed,
      expiresAt: { $gt: new Date() },
    });
  }

  protected toEntity(document: LeanDocument<FeedSnapshot>): FeedSnapshotEntity {
    return toPlainEntity(document);
  }
}
