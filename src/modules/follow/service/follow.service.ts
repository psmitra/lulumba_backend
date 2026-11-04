import type { PaginationQueryDto } from '@common/dto/pagination-query.dto.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import type { PaginatedResult } from '@common/interfaces/pagination.interface.js';
import type { FollowEntity } from '@app-types/follow.types.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { FollowRepository } from '@database/repositories/follow.repository.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import type {
  FollowListItemDto,
  FollowStatsResponseDto,
} from '../dto/follow-response.dto.js';

@Injectable()
export class FollowService {
  constructor(
    private readonly follows: FollowRepository,
    private readonly blocks: BlockRepository,
    private readonly profiles: ProfilesService,
  ) {}

  /** Idempotent: following someone already followed returns that follow. */
  async follow(followerId: string, followingId: string): Promise<FollowEntity> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.assertActiveUser(followingId);
    if (await this.blocks.isBlockedEitherWay(followerId, followingId)) {
      throw new ForbiddenException('You cannot follow this user');
    }

    try {
      return await this.follows.create({ followerId, followingId });
    } catch (error) {
      // Already following (or a concurrent request won the race).
      if (error instanceof DuplicateKeyError) {
        const existing = await this.follows.findPair(followerId, followingId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /** Idempotent: unfollowing someone not followed is a no-op. */
  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.follows.deletePair(followerId, followingId);
  }

  /** People who follow `userId`, newest first. */
  async listFollowers(
    callerId: string,
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<FollowListItemDto>> {
    await this.assertActiveUser(userId);
    const page = await this.follows.findPaginated(
      { followingId: userId },
      { page: query.page, limit: query.limit },
    );
    return this.withProfiles(callerId, page, (follow) => follow.followerId);
  }

  /** People `userId` follows, newest first. */
  async listFollowing(
    callerId: string,
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<FollowListItemDto>> {
    await this.assertActiveUser(userId);
    const page = await this.follows.findPaginated(
      { followerId: userId },
      { page: query.page, limit: query.limit },
    );
    return this.withProfiles(callerId, page, (follow) => follow.followingId);
  }

  /** Counts for `userId`, and how the caller relates to them. */
  async stats(
    callerId: string,
    userId: string,
  ): Promise<FollowStatsResponseDto> {
    await this.assertActiveUser(userId);
    const [followersCount, followingCount, isFollowing, isFollowedBy] =
      await Promise.all([
        this.follows.count({ followingId: userId }),
        this.follows.count({ followerId: userId }),
        this.follows.exists({ followerId: callerId, followingId: userId }),
        this.follows.exists({ followerId: userId, followingId: callerId }),
      ]);
    return { followersCount, followingCount, isFollowing, isFollowedBy };
  }

  /**
   * Attaches each listed user's profile and whether the caller follows them,
   * in two queries per page. Users whose profile is gone or disabled are left
   * out, so a page can hold fewer than `limit` items; `total` still counts
   * them.
   */
  private async withProfiles(
    callerId: string,
    page: PaginatedResult<FollowEntity>,
    listedUserId: (follow: FollowEntity) => string,
  ): Promise<PaginatedResult<FollowListItemDto>> {
    const userIds = page.items.map(listedUserId);
    const [profiles, followedIds] = await Promise.all([
      this.profiles.findByExternalUserIds(userIds),
      this.follows.findFollowedIds(callerId, userIds),
    ]);
    const profilesById = new Map(
      profiles.map((profile) => [profile.externalUserId, profile]),
    );
    const followed = new Set(followedIds);

    const items: FollowListItemDto[] = [];
    for (const follow of page.items) {
      const userId = listedUserId(follow);
      const profile = profilesById.get(userId);
      if (!profile?.isActive) continue;
      items.push({
        user: ProfileSummaryDto.fromEntity(profile),
        followedAt: follow.createdAt,
        isFollowing: followed.has(userId),
        isMe: userId === callerId,
      });
    }
    return { ...page, items };
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const profile = await this.profiles.findByExternalUserId(userId);
    if (!profile?.isActive) {
      throw new NotFoundException('User not found');
    }
  }
}
