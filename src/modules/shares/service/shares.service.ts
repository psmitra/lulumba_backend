import type { PostEntity } from '@app-types/post.types.js';
import { ShareType } from '@app-types/share.types.js';
import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import { ShareRepository } from '@database/repositories/share.repository.js';
import { PostsService } from '@modules/posts/service/posts.service.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import type {
  CreateShareDto,
  ShareLinkResponseDto,
  ShareResponseDto,
} from '../dto/share.dto.js';

/**
 * Shares point at the app's canonical post page. Opening that page loads the
 * post through GET /posts/:postId, which applies every access rule, so a
 * link never makes a followers-only post public.
 */
@Injectable()
export class SharesService {
  private readonly postUrlBase: string;

  constructor(
    private readonly shares: ShareRepository,
    private readonly posts: PostRepository,
    private readonly blocks: BlockRepository,
    private readonly postsService: PostsService,
    private readonly profiles: ProfilesService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    const frontend = new URL(config.get('FRONTEND_URL', { infer: true }));
    this.postUrlBase = `${frontend.origin}${frontend.pathname.replace(/\/$/, '')}/posts`;
  }

  /**
   * Every action is recorded, but `sharesCount` counts reach, not taps: it
   * moves once per user, post and share type (and recipient, for internal
   * shares), so copying a link ten times counts once.
   */
  async share(
    postId: string,
    userId: string,
    input: CreateShareDto,
  ): Promise<ShareResponseDto> {
    const post = await this.visiblePost(postId, userId);
    const recipientUserId = await this.checkRecipient(post, userId, input);

    const sameShare = {
      postId: new Types.ObjectId(post.id),
      userId,
      shareType: input.shareType,
      recipientUserId: recipientUserId ?? null,
    };
    const isNewReach = !(await this.shares.exists(sameShare));
    const share = await this.shares.create({
      postId: sameShare.postId,
      userId,
      shareType: input.shareType,
      recipientUserId,
    });
    const sharesCount = isNewReach
      ? await this.posts.adjustCounter(post.id, 'sharesCount', 1)
      : (await this.posts.findById(post.id))?.sharesCount;

    return {
      shareId: share.id,
      shareUrl: this.urlFor(post.id),
      sharedAt: share.createdAt,
      sharesCount: sharesCount ?? post.sharesCount,
    };
  }

  /** The canonical URL, for posts the caller may see. */
  async link(
    postId: string,
    callerId: string | undefined,
  ): Promise<ShareLinkResponseDto> {
    const post = await this.visiblePost(postId, callerId);
    return { shareUrl: this.urlFor(post.id), visibility: post.visibility };
  }

  urlFor(postId: string): string {
    return `${this.postUrlBase}/${postId}`;
  }

  /**
   * Internal shares need an active recipient who isn't the sharer, isn't
   * blocked either way, and can see the post themselves.
   */
  private async checkRecipient(
    post: PostEntity,
    userId: string,
    input: CreateShareDto,
  ): Promise<string | undefined> {
    if (input.shareType !== ShareType.Internal) {
      if (input.recipientUserId) {
        throw new BadRequestException(
          'recipientUserId is only for internal shares',
        );
      }
      return undefined;
    }

    const recipientId = input.recipientUserId;
    if (!recipientId) {
      throw new BadRequestException('Internal shares need a recipientUserId');
    }
    if (recipientId === userId) {
      throw new BadRequestException('You cannot share a post with yourself');
    }
    const recipient = await this.profiles.findByExternalUserId(recipientId);
    if (
      !recipient?.isActive ||
      (await this.blocks.isBlockedEitherWay(userId, recipientId))
    ) {
      throw new NotFoundException('Recipient not found');
    }
    if (!(await this.postsService.canView(post, recipientId))) {
      throw new ForbiddenException(
        'The recipient is not allowed to see this post',
      );
    }
    return recipientId;
  }

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
}
