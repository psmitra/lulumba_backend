import type { PostEntity } from '@app-types/post.types.js';
import type { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import type { CursorMeta } from '@common/response/response.interface.js';
import { cursorMeta, parseCursorQuery } from '@common/utils/cursor.util.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { FollowRepository } from '@database/repositories/follow.repository.js';
import { LikeRepository } from '@database/repositories/like.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import type { Like } from '@database/schemas/like.schema.js';
import { PostsService } from '@modules/posts/service/posts.service.js';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Types, type QueryFilter } from 'mongoose';
import type { LikeStateDto, LikerDto } from '../dto/like-response.dto.js';

@Injectable()
export class LikesService {
  constructor(
    private readonly likes: LikeRepository,
    private readonly posts: PostRepository,
    private readonly blocks: BlockRepository,
    private readonly follows: FollowRepository,
    private readonly postsService: PostsService,
    private readonly profiles: ProfilesService,
  ) {}

  /**
   * Idempotent: the unique (postId, userId) index allows one like, and the
   * counter only moves when a like was actually created.
   */
  async like(postId: string, userId: string): Promise<LikeStateDto> {
    const post = await this.visiblePost(postId, userId);
    try {
      await this.likes.create({ postId: new Types.ObjectId(post.id), userId });
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        return { liked: true, likesCount: await this.countOf(post) };
      }
      throw error;
    }
    const likesCount = await this.posts.adjustCounter(post.id, 'likesCount', 1);
    return { liked: true, likesCount: likesCount ?? post.likesCount + 1 };
  }

  /**
   * Idempotent. Works even if the post became hidden from the caller
   * (e.g. after a block), so a like can always be taken back.
   */
  async unlike(postId: string, userId: string): Promise<LikeStateDto> {
    const post = await this.posts.findActiveById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    const removed = await this.likes.deletePair(post.id, userId);
    const likesCount = removed
      ? await this.posts.adjustCounter(post.id, 'likesCount', -1)
      : await this.countOf(post);
    return { liked: false, likesCount: likesCount ?? 0 };
  }

  /**
   * Who liked a post, newest first. Same visibility as the post; users
   * blocked either way with the caller, or with disabled profiles, are left
   * out.
   */
  async list(
    postId: string,
    callerId: string | undefined,
    query: CursorQueryDto,
  ): Promise<{ items: LikerDto[]; meta: CursorMeta }> {
    const after = parseCursorQuery(query.cursor);
    const post = await this.visiblePost(postId, callerId);

    const filter: QueryFilter<Like> = { postId: new Types.ObjectId(post.id) };
    if (callerId) {
      const hidden = await this.blocks.findHiddenUserIds(callerId);
      if (hidden.length > 0) filter.userId = { $nin: hidden };
    }
    const page = await this.likes.findCursorPage(filter, query.limit, after);

    const userIds = page.items.map((like) => like.userId);
    const [profiles, followedIds] = await Promise.all([
      this.profiles.findByExternalUserIds(userIds),
      callerId ? this.follows.findFollowedIds(callerId, userIds) : [],
    ]);
    const profilesById = new Map(profiles.map((p) => [p.externalUserId, p]));
    const followed = new Set(followedIds);

    const items: LikerDto[] = [];
    for (const like of page.items) {
      const profile = profilesById.get(like.userId);
      if (!profile?.isActive) continue;
      items.push({
        user: ProfileSummaryDto.fromEntity(profile),
        likedAt: like.createdAt,
        isFollowing: followed.has(like.userId),
        isMe: like.userId === callerId,
      });
    }
    return { items, meta: cursorMeta(page, query.limit) };
  }

  /** Posts the caller can't see behave as missing. */
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

  private async countOf(post: PostEntity): Promise<number> {
    return (await this.posts.findById(post.id))?.likesCount ?? post.likesCount;
  }
}
