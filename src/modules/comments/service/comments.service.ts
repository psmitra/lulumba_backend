import type { CommentEntity } from '@app-types/comment.types.js';
import type { PostEntity } from '@app-types/post.types.js';
import type { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import type { CursorMeta } from '@common/response/response.interface.js';
import { cursorMeta, parseCursorQuery } from '@common/utils/cursor.util.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { CommentRepository } from '@database/repositories/comment.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import type { Comment } from '@database/schemas/comment.schema.js';
import { PostsService } from '@modules/posts/service/posts.service.js';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types, type QueryFilter } from 'mongoose';
import {
  CommentSort,
  type ListCommentsQueryDto,
} from '../dto/comment-input.dto.js';
import type {
  CommentResponseDto,
  ReplyResponseDto,
} from '../dto/comment-response.dto.js';

type Page<T> = { items: T[]; meta: CursorMeta };

/**
 * Comments and one level of replies, in one collection (`parentId: null`
 * for comments). `post.commentsCount` counts active comments and replies;
 * `comment.repliesCount` counts its active replies.
 *
 * Deleting a comment keeps its replies: if it has any, it stays in the list
 * as a "[deleted]" marker (no author or body) so the thread still reads.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly posts: PostRepository,
    private readonly blocks: BlockRepository,
    private readonly postsService: PostsService,
    private readonly profiles: ProfilesService,
  ) {}

  // ---- Comments ---------------------------------------------------------

  async createComment(
    postId: string,
    authorId: string,
    body: string,
  ): Promise<CommentResponseDto> {
    const post = await this.visiblePost(postId, authorId);
    const comment = await this.comments.create({
      postId: new Types.ObjectId(post.id),
      parentId: null,
      authorId,
      body,
    });
    await this.posts.adjustCounter(post.id, 'commentsCount', 1);
    return this.presentOneComment(comment, authorId);
  }

  async listComments(
    postId: string,
    callerId: string | undefined,
    query: ListCommentsQueryDto,
  ): Promise<Page<CommentResponseDto>> {
    const after = parseCursorQuery(query.cursor);
    const post = await this.visiblePost(postId, callerId);
    const hidden = callerId
      ? await this.blocks.findHiddenUserIds(callerId)
      : [];

    const filter: QueryFilter<Comment> = {
      postId: new Types.ObjectId(post.id),
      parentId: null,
      $or: [
        { deletedAt: null, ...authorNotIn(hidden) },
        // "[deleted]" markers that still hold a thread together.
        { deletedAt: { $ne: null }, repliesCount: { $gt: 0 } },
      ],
    };
    const page = await this.comments.findCursorPage(
      filter,
      query.limit,
      after,
      query.sort === CommentSort.Newest ? 'desc' : 'asc',
    );
    return {
      items: await this.presentComments(page.items, callerId),
      meta: cursorMeta(page, query.limit),
    };
  }

  async updateComment(
    commentId: string,
    callerId: string,
    body: string,
  ): Promise<CommentResponseDto> {
    await this.ownItem(commentId, callerId, 'comment');
    const updated = await this.comments.updateBody(commentId, callerId, body);
    if (!updated) throw new NotFoundException('Comment not found');
    return this.presentOneComment(updated, callerId);
  }

  async deleteComment(commentId: string, callerId: string): Promise<void> {
    const comment = await this.ownItem(commentId, callerId, 'comment');
    if (await this.comments.softDelete(commentId, callerId)) {
      await this.posts.adjustCounter(
        comment.postId.toString(),
        'commentsCount',
        -1,
      );
    }
  }

  // ---- Replies ----------------------------------------------------------

  async createReply(
    commentId: string,
    authorId: string,
    body: string,
  ): Promise<ReplyResponseDto> {
    const parent = await this.comments.findActiveById(commentId);
    if (!parent) {
      throw new NotFoundException('Comment not found');
    }
    if (parent.parentId) {
      throw new BadRequestException(
        'Replies are one level deep: reply to the comment instead',
      );
    }
    const post = await this.visiblePost(parent.postId.toString(), authorId);
    if (await this.blocks.isBlockedEitherWay(authorId, parent.authorId)) {
      throw new ForbiddenException('You cannot reply to this comment');
    }

    const reply = await this.comments.create({
      postId: new Types.ObjectId(post.id),
      parentId: new Types.ObjectId(parent.id),
      authorId,
      body,
    });
    await Promise.all([
      this.comments.incrementReplies(parent.id, 1),
      this.posts.adjustCounter(post.id, 'commentsCount', 1),
    ]);
    return this.presentOneReply(reply, authorId);
  }

  /** Oldest first: a thread reads top to bottom. */
  async listReplies(
    commentId: string,
    callerId: string | undefined,
    query: CursorQueryDto,
  ): Promise<Page<ReplyResponseDto>> {
    const after = parseCursorQuery(query.cursor);
    const parent = await this.comments.findById(commentId);
    // A deleted comment still shows its remaining replies.
    if (
      !parent ||
      parent.parentId ||
      (parent.deletedAt && parent.repliesCount === 0)
    ) {
      throw new NotFoundException('Comment not found');
    }
    await this.visiblePost(parent.postId.toString(), callerId);
    const hidden = callerId
      ? await this.blocks.findHiddenUserIds(callerId)
      : [];

    const page = await this.comments.findCursorPage(
      {
        parentId: new Types.ObjectId(parent.id),
        deletedAt: null,
        ...authorNotIn(hidden),
      },
      query.limit,
      after,
      'asc',
    );
    return {
      items: await this.presentReplies(page.items, callerId),
      meta: cursorMeta(page, query.limit),
    };
  }

  async updateReply(
    replyId: string,
    callerId: string,
    body: string,
  ): Promise<ReplyResponseDto> {
    await this.ownItem(replyId, callerId, 'reply');
    const updated = await this.comments.updateBody(replyId, callerId, body);
    if (!updated) throw new NotFoundException('Reply not found');
    return this.presentOneReply(updated, callerId);
  }

  async deleteReply(replyId: string, callerId: string): Promise<void> {
    const reply = await this.ownItem(replyId, callerId, 'reply');
    if (await this.comments.softDelete(replyId, callerId)) {
      await Promise.all([
        this.comments.incrementReplies(reply.parentId!.toString(), -1),
        this.posts.adjustCounter(reply.postId.toString(), 'commentsCount', -1),
      ]);
    }
  }

  // ---- Helpers ----------------------------------------------------------

  /** Posts the caller can't see (or blocked authors) behave as missing. */
  private async visiblePost(
    postId: string,
    callerId: string | undefined,
  ): Promise<PostEntity> {
    const post = await this.posts.findActiveById(postId);
    if (!post || !(await this.postsService.canView(post, callerId))) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  /**
   * An active comment (or reply) by the caller. A reply id on a comment
   * route, or the other way round, is not found.
   */
  private async ownItem(
    id: string,
    callerId: string,
    kind: 'comment' | 'reply',
  ): Promise<CommentEntity> {
    const label = kind === 'comment' ? 'Comment' : 'Reply';
    const item = await this.comments.findActiveById(id);
    if (!item || (kind === 'comment') !== (item.parentId === null)) {
      throw new NotFoundException(`${label} not found`);
    }
    if (item.authorId !== callerId) {
      throw new ForbiddenException(`Only the author can change this ${kind}`);
    }
    return item;
  }

  private async authorsOf(items: CommentEntity[]) {
    const profiles = await this.profiles.findByExternalUserIds([
      ...new Set(items.map((item) => item.authorId)),
    ]);
    return new Map(
      profiles.map((profile) => [profile.externalUserId, profile]),
    );
  }

  /** Active comments by disabled profiles are left out. */
  private async presentComments(
    comments: CommentEntity[],
    callerId?: string,
  ): Promise<CommentResponseDto[]> {
    const authors = await this.authorsOf(comments);
    const result: CommentResponseDto[] = [];
    for (const comment of comments) {
      const isDeleted = !!comment.deletedAt;
      const author = authors.get(comment.authorId);
      if (!isDeleted && !author?.isActive) continue;
      result.push({
        id: comment.id,
        postId: comment.postId.toString(),
        user:
          isDeleted || !author ? null : ProfileSummaryDto.fromEntity(author),
        body: isDeleted ? null : comment.body,
        repliesCount: comment.repliesCount,
        isDeleted,
        isEdited: !isDeleted && !!comment.editedAt,
        isMine: !isDeleted && comment.authorId === callerId,
        createdAt: comment.createdAt,
      });
    }
    return result;
  }

  private async presentReplies(
    replies: CommentEntity[],
    callerId?: string,
  ): Promise<ReplyResponseDto[]> {
    const authors = await this.authorsOf(replies);
    const result: ReplyResponseDto[] = [];
    for (const reply of replies) {
      const author = authors.get(reply.authorId);
      if (!author?.isActive) continue;
      result.push({
        id: reply.id,
        commentId: reply.parentId!.toString(),
        postId: reply.postId.toString(),
        user: ProfileSummaryDto.fromEntity(author),
        body: reply.body,
        isEdited: !!reply.editedAt,
        isMine: reply.authorId === callerId,
        createdAt: reply.createdAt,
      });
    }
    return result;
  }

  private async presentOneComment(
    comment: CommentEntity,
    callerId: string,
  ): Promise<CommentResponseDto> {
    const [response] = await this.presentComments([comment], callerId);
    if (!response) throw new NotFoundException('Comment not found');
    return response;
  }

  private async presentOneReply(
    reply: CommentEntity,
    callerId: string,
  ): Promise<ReplyResponseDto> {
    const [response] = await this.presentReplies([reply], callerId);
    if (!response) throw new NotFoundException('Reply not found');
    return response;
  }
}

function authorNotIn(hidden: string[]): QueryFilter<Comment> {
  return hidden.length > 0 ? { authorId: { $nin: hidden } } : {};
}
