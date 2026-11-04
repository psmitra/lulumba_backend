import type { BookmarkEntity } from '@app-types/bookmark.types.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Bookmark } from '@database/schemas/bookmark.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { MediaType } from '@app-types/media.types.js';
import type { CursorPosition } from '@common/utils/cursor.util.js';
import {
  afterCursor,
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

// Set by @Schema({ collection: 'posts' }) in post.schema.ts.
const POSTS_COLLECTION = 'posts';

@Injectable()
export class BookmarkRepository extends BaseCrudRepository<
  Bookmark,
  BookmarkEntity
> {
  constructor(@InjectModel(Bookmark.name) model: Model<Bookmark>) {
    super(model);
  }

  findPair(userId: string, postId: string): Promise<BookmarkEntity | null> {
    if (!isValidObjectId(postId)) {
      return Promise.resolve(null);
    }
    return this.findOne({ userId, postId: new Types.ObjectId(postId) });
  }

  /** Resolves to true when a bookmark was removed. */
  deletePair(userId: string, postId: string): Promise<boolean> {
    if (!isValidObjectId(postId)) {
      return Promise.resolve(false);
    }
    return this.deleteOne({ userId, postId: new Types.ObjectId(postId) });
  }

  /** Which of `postIds` the user has saved (for "is saved" on a feed page). */
  async findSavedPostIds(userId: string, postIds: string[]): Promise<string[]> {
    const bookmarks = await this.findProjected<Pick<Bookmark, 'postId'>>(
      {
        userId,
        postId: {
          $in: postIds
            .filter(isValidObjectId)
            .map((id) => new Types.ObjectId(id)),
        },
      },
      { postId: 1 },
    );
    return bookmarks.map((bookmark) => bookmark.postId.toString());
  }

  /** How many users saved each of `postIds` (feed ranking). */
  async countByPostIds(postIds: string[]): Promise<Map<string, number>> {
    const ids = postIds
      .filter(isValidObjectId)
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) {
      return new Map();
    }
    const counts = await this.model.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { postId: { $in: ids } } },
      { $group: { _id: '$postId', count: { $sum: 1 } } },
    ]);
    return new Map(counts.map((row) => [row._id.toString(), row.count]));
  }

  /**
   * A page of the user's Shortlist, newest first, keeping only bookmarks
   * whose post still exists (and has `mediaType`, when given). The join runs
   * per page, before the limit, so filtered pages are still full.
   */
  async findShortlistPage(
    userId: string,
    limit: number,
    options: { after?: CursorPosition; mediaType?: MediaType } = {},
  ): Promise<{ items: BookmarkEntity[]; hasMore: boolean }> {
    const postFilter: Record<string, unknown> = { deletedAt: null };
    if (options.mediaType) postFilter.mediaTypes = options.mediaType;

    const documents = await this.model.aggregate<LeanDocument<Bookmark>>([
      {
        $match: {
          userId,
          ...(options.after ? afterCursor(options.after) : {}),
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: POSTS_COLLECTION,
          localField: 'postId',
          foreignField: '_id',
          pipeline: [{ $match: postFilter }, { $project: { _id: 1 } }],
          as: 'post',
        },
      },
      { $match: { 'post.0': { $exists: true } } },
      { $limit: limit + 1 },
      { $project: { post: 0 } },
    ]);
    return {
      items: documents.slice(0, limit).map((doc) => this.toEntity(doc)),
      hasMore: documents.length > limit,
    };
  }

  protected toEntity(document: LeanDocument<Bookmark>): BookmarkEntity {
    return toPlainEntity(document);
  }
}
