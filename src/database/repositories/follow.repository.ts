import type { FollowEntity } from '@app-types/follow.types.js';
import { Follow } from '@database/schemas/follow.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class FollowRepository extends BaseCrudRepository<Follow, FollowEntity> {
  constructor(@InjectModel(Follow.name) model: Model<Follow>) {
    super(model);
  }

  findPair(
    followerId: string,
    followingId: string,
  ): Promise<FollowEntity | null> {
    return this.findOne({ followerId, followingId });
  }

  /** Resolves to true when a follow was removed. */
  deletePair(followerId: string, followingId: string): Promise<boolean> {
    return this.deleteOne({ followerId, followingId });
  }

  /** Which of `candidateIds` `followerId` follows (for follow buttons). */
  async findFollowedIds(
    followerId: string,
    candidateIds: string[],
  ): Promise<string[]> {
    if (candidateIds.length === 0) {
      return [];
    }
    const follows = await this.findProjected<Pick<Follow, 'followingId'>>(
      { followerId, followingId: { $in: candidateIds } },
      { followingId: 1 },
    );
    return follows.map((follow) => follow.followingId);
  }

  /** Everyone `followerId` follows, most recent first, up to `limit`. */
  async findFollowingIds(followerId: string, limit: number): Promise<string[]> {
    const follows = await this.findProjected<Pick<Follow, 'followingId'>>(
      { followerId },
      { followingId: 1 },
      { sort: { createdAt: -1 }, limit },
    );
    return follows.map((follow) => follow.followingId);
  }

  protected toEntity(document: LeanDocument<Follow>): FollowEntity {
    return toPlainEntity(document);
  }
}
