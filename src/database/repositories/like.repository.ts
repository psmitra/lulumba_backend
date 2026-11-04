import type { LikeEntity } from '@app-types/like.types.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Like } from '@database/schemas/like.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class LikeRepository extends BaseCrudRepository<Like, LikeEntity> {
  constructor(@InjectModel(Like.name) model: Model<Like>) {
    super(model);
  }

  findPair(postId: string, userId: string): Promise<LikeEntity | null> {
    if (!isValidObjectId(postId)) {
      return Promise.resolve(null);
    }
    return this.findOne({ postId: new Types.ObjectId(postId), userId });
  }

  /** Resolves to true when a like was removed. */
  deletePair(postId: string, userId: string): Promise<boolean> {
    if (!isValidObjectId(postId)) {
      return Promise.resolve(false);
    }
    return this.deleteOne({ postId: new Types.ObjectId(postId), userId });
  }

  /** Which of `postIds` the user has liked (for "is liked" on a feed page). */
  async findLikedPostIds(userId: string, postIds: string[]): Promise<string[]> {
    const likes = await this.findProjected<Pick<Like, 'postId'>>(
      { userId, postId: { $in: toObjectIds(postIds) } },
      { postId: 1 },
    );
    return likes.map((like) => like.postId.toString());
  }

  /** Posts the user liked since `since`, newest first (feed affinity). */
  async findRecentPostIdsBy(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<string[]> {
    const likes = await this.findProjected<Pick<Like, 'postId'>>(
      { userId, createdAt: { $gte: since } },
      { postId: 1 },
      { sort: { createdAt: -1 }, limit },
    );
    return likes.map((like) => like.postId.toString());
  }

  protected toEntity(document: LeanDocument<Like>): LikeEntity {
    return toPlainEntity(document);
  }
}

function toObjectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter(isValidObjectId).map((id) => new Types.ObjectId(id));
}
