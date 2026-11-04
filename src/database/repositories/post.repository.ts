import type { PostEntity } from '@app-types/post.types.js';
import { Post } from '@database/schemas/post.schema.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
  type RepositoryOptions,
} from './base.repository.js';

export type PostCounter = 'likesCount' | 'commentsCount' | 'sharesCount';

/** Inputs of the database-side pre-score (see findTopCandidates). */
export interface PreScoreWeights {
  like: number;
  comment: number;
  share: number;
  ageOffsetHours: number;
  gravity: number;
}

const HOUR_MS = 3_600_000;

@Injectable()
export class PostRepository extends BaseCrudRepository<Post, PostEntity> {
  constructor(@InjectModel(Post.name) model: Model<Post>) {
    super(model);
  }

  /** A post that hasn't been soft-deleted. */
  findActiveById(id: string): Promise<PostEntity | null> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(null);
    }
    return this.findOne({ _id: id, deletedAt: null });
  }

  /** The post a retried create already made, if any. */
  findByIdempotencyKey(
    authorId: string,
    idempotencyKey: string,
  ): Promise<PostEntity | null> {
    return this.findOne({ authorId, idempotencyKey });
  }

  /**
   * Atomic counter change that returns the new value (null when the post
   * is gone). Never drops below zero.
   */
  async adjustCounter(
    id: string,
    counter: PostCounter,
    by: number,
  ): Promise<number | null> {
    const filter: QueryFilter<Post> =
      by < 0 ? { _id: id, [counter]: { $gte: -by } } : { _id: id };
    const post = await this.findOneAndUpdateWhere(filter, {
      $inc: { [counter]: by },
    });
    if (post) return post[counter];
    // Already at zero (a drifted counter): report the stored value.
    return (await this.findById(id))?.[counter] ?? null;
  }

  /** True when any of `mediaIds` is attached to another active post. */
  isMediaAttachedElsewhere(
    mediaIds: string[],
    exceptPostId?: string,
  ): Promise<boolean> {
    return this.exists({
      'attachments.mediaId': {
        $in: mediaIds.map((id) => new Types.ObjectId(id)),
      },
      deletedAt: null,
      ...(exceptPostId ? { _id: { $ne: exceptPostId } } : {}),
    });
  }

  /** Active posts that show this media. */
  findActiveByMediaId(mediaId: string): Promise<PostEntity[]> {
    return this.findAll(
      { 'attachments.mediaId': new Types.ObjectId(mediaId), deletedAt: null },
      { limit: 20 },
    );
  }

  /** Atomic counter change; never drops below zero. */
  incrementCounter(
    id: string,
    counter: PostCounter,
    by: number,
    options: RepositoryOptions = {},
  ): Promise<boolean> {
    const filter = by < 0 ? { _id: id, [counter]: { $gte: -by } } : { _id: id };
    return this.updateOneWhere(filter, { $inc: { [counter]: by } }, options);
  }

  /**
   * The `limit` posts matching `filter` with the highest pre-score:
   * `(1 + likes·like + comments·comment + shares·share) / (ageHours +
   * ageOffsetHours) ^ gravity`. Narrows a feed's candidates in the database;
   * the feed then computes the full score. `filter` is passed to an
   * aggregation, so ids in it must already be ObjectIds.
   */
  async findTopCandidates(
    filter: QueryFilter<Post>,
    limit: number,
    weights: PreScoreWeights,
  ): Promise<PostEntity[]> {
    const documents = await this.model.aggregate<LeanDocument<Post>>([
      { $match: filter },
      {
        $addFields: {
          _preScore: {
            $divide: [
              {
                $add: [
                  1,
                  { $multiply: ['$likesCount', weights.like] },
                  { $multiply: ['$commentsCount', weights.comment] },
                  { $multiply: ['$sharesCount', weights.share] },
                ],
              },
              {
                $pow: [
                  {
                    $add: [
                      {
                        $max: [
                          0,
                          {
                            $divide: [
                              { $subtract: ['$$NOW', '$createdAt'] },
                              HOUR_MS,
                            ],
                          },
                        ],
                      },
                      weights.ageOffsetHours,
                    ],
                  },
                  weights.gravity,
                ],
              },
            ],
          },
        },
      },
      { $sort: { _preScore: -1, _id: -1 } },
      { $limit: limit },
      { $project: { _preScore: 0 } },
    ]);
    return documents.map((document) => this.toEntity(document));
  }

  /** The author of each of `postIds` that exists. */
  async findAuthorIds(postIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(postIds)].filter(isValidObjectId);
    if (ids.length === 0) {
      return new Map();
    }
    const posts = await this.findProjected<{
      _id: Types.ObjectId;
      authorId: string;
    }>({ _id: { $in: ids } }, { authorId: 1 });
    return new Map(posts.map((post) => [post._id.toString(), post.authorId]));
  }

  /** Resolves to true when an active post was soft-deleted. */
  softDelete(id: string, authorId: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(false);
    }
    return this.updateOneWhere(
      { _id: id, authorId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }

  protected toEntity(document: LeanDocument<Post>): PostEntity {
    return toPlainEntity(document);
  }
}
