import type { CommentEntity } from '@app-types/comment.types.js';
import { Comment } from '@database/schemas/comment.schema.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
  type RepositoryOptions,
} from './base.repository.js';

@Injectable()
export class CommentRepository extends BaseCrudRepository<
  Comment,
  CommentEntity
> {
  constructor(@InjectModel(Comment.name) model: Model<Comment>) {
    super(model);
  }

  /** A comment or reply that hasn't been soft-deleted. */
  findActiveById(id: string): Promise<CommentEntity | null> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(null);
    }
    return this.findOne({ _id: id, deletedAt: null });
  }

  /** Atomic `repliesCount` change; never drops below zero. */
  incrementReplies(
    id: string,
    by: number,
    options: RepositoryOptions = {},
  ): Promise<boolean> {
    const filter =
      by < 0 ? { _id: id, repliesCount: { $gte: -by } } : { _id: id };
    return this.updateOneWhere(filter, { $inc: { repliesCount: by } }, options);
  }

  /** Author-only edit of an active comment or reply. */
  updateBody(
    id: string,
    authorId: string,
    body: string,
  ): Promise<CommentEntity | null> {
    return this.findOneAndUpdateWhere(
      { _id: id, authorId, deletedAt: null },
      { $set: { body, editedAt: new Date() } },
    );
  }

  /**
   * Resolves to true when an active comment was soft-deleted. Conditional,
   * so deleting twice never moves counters twice.
   */
  softDelete(id: string, authorId: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(false);
    }
    return this.updateOneWhere(
      { _id: id, authorId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }

  /**
   * Posts the user commented on or replied to since `since`, newest first,
   * once per comment (feed affinity).
   */
  async findRecentPostIdsBy(
    authorId: string,
    since: Date,
    limit: number,
  ): Promise<string[]> {
    const comments = await this.findProjected<Pick<Comment, 'postId'>>(
      { authorId, createdAt: { $gte: since }, deletedAt: null },
      { postId: 1 },
      { sort: { createdAt: -1 }, limit },
    );
    return comments.map((comment) => comment.postId.toString());
  }

  protected toEntity(document: LeanDocument<Comment>): CommentEntity {
    return toPlainEntity(document);
  }
}
