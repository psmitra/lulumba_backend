import { MediaType, type MediaEntity } from '@app-types/media.types.js';
import type { PostEntity } from '@app-types/post.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import type { CursorMeta } from '@common/response/response.interface.js';
import { cursorMeta, parseCursorQuery } from '@common/utils/cursor.util.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { FollowRepository } from '@database/repositories/follow.repository.js';
import { MediaRepository } from '@database/repositories/media.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import type { Post, PostAttachment } from '@database/schemas/post.schema.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types, type QueryFilter } from 'mongoose';
import type {
  AttachmentInputDto,
  CreatePostDto,
  UpdatePostDto,
} from '../dto/post-input.dto.js';
import type { ListPostsQueryDto } from '../dto/list-posts-query.dto.js';
import type { PostResponseDto } from '../dto/post-response.dto.js';
import {
  ALLOW_MIXED_MEDIA_TYPES,
  MEDIA_TYPE_FOR_FILTER,
} from '../posts.constants.js';
import { PostPresenter } from './post-presenter.service.js';

const MB = 1024 * 1024;

@Injectable()
export class PostsService {
  private readonly maxBytes: Record<MediaType, number>;

  constructor(
    private readonly posts: PostRepository,
    private readonly media: MediaRepository,
    private readonly follows: FollowRepository,
    private readonly blocks: BlockRepository,
    private readonly presenter: PostPresenter,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.maxBytes = {
      [MediaType.Image]:
        config.get('STORAGE_MAX_IMAGE_MB', { infer: true }) * MB,
      [MediaType.Video]:
        config.get('STORAGE_MAX_VIDEO_MB', { infer: true }) * MB,
      [MediaType.Document]:
        config.get('STORAGE_MAX_DOCUMENT_MB', { infer: true }) * MB,
    };
  }

  async create(
    authorId: string,
    input: CreatePostDto,
  ): Promise<PostResponseDto> {
    if (input.idempotencyKey) {
      const existing = await this.posts.findByIdempotencyKey(
        authorId,
        input.idempotencyKey,
      );
      if (existing) return this.present(existing, authorId);
    }

    const attachments = await this.newAttachments(authorId, input.attachments);
    let post: PostEntity;
    try {
      post = await this.posts.create({
        authorId,
        caption: input.caption || undefined,
        visibility: input.visibility,
        attachments,
        mediaTypes: distinctTypes(attachments),
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      // A concurrent retry with the same idempotency key won the race.
      const existing =
        error instanceof DuplicateKeyError && input.idempotencyKey
          ? await this.posts.findByIdempotencyKey(
              authorId,
              input.idempotencyKey,
            )
          : null;
      if (!existing) throw error;
      post = existing;
    }
    return this.present(post, authorId);
  }

  /** Applies visibility, block and deleted-content rules. */
  async findOne(postId: string, callerId?: string): Promise<PostResponseDto> {
    const post = await this.posts.findActiveById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    await this.assertCanView(post, callerId);
    return this.present(post, callerId);
  }

  async update(
    postId: string,
    callerId: string,
    input: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.ownPost(postId, callerId);
    const changes: Partial<Post> = {
      caption: input.caption,
      visibility: input.visibility,
    };
    if (input.attachments) {
      changes.attachments = reorderAttachments(post, input.attachments);
      changes.mediaTypes = distinctTypes(changes.attachments);
    }

    const updated = await this.posts.update(postId, changes);
    if (!updated) {
      throw new NotFoundException('Post not found');
    }
    return this.present(updated, callerId);
  }

  /** Soft delete; media files are kept for a later cleanup job. */
  async remove(postId: string, callerId: string): Promise<void> {
    await this.ownPost(postId, callerId);
    await this.posts.softDelete(postId, callerId);
  }

  /** Discovery list (not the personalized home feed), newest first. */
  async list(
    callerId: string,
    query: ListPostsQueryDto,
  ): Promise<{ items: PostResponseDto[]; meta: CursorMeta }> {
    const after = parseCursorQuery(query.cursor);
    const hiddenAuthors = await this.blocks.findHiddenUserIds(callerId);
    const filter: QueryFilter<Post> = { deletedAt: null };
    if (query.type) {
      filter.mediaTypes = MEDIA_TYPE_FOR_FILTER[query.type];
    }
    if (query.userId) {
      if (hiddenAuthors.includes(query.userId)) {
        return {
          items: [],
          meta: { limit: query.limit, nextCursor: null, hasMore: false },
        };
      }
      filter.authorId = query.userId;
      if (!(await this.canSeeFollowersOnly(query.userId, callerId))) {
        filter.visibility = PostVisibility.Public;
      }
    } else {
      // Followers-only posts appear in the home feed, not in discovery.
      filter.visibility = PostVisibility.Public;
      if (hiddenAuthors.length > 0) {
        filter.authorId = { $nin: hiddenAuthors };
      }
    }

    const page = await this.posts.findCursorPage(filter, query.limit, after);
    return {
      items: await this.presenter.present(page.items, callerId),
      meta: cursorMeta(page, query.limit),
    };
  }

  /**
   * Checks the media to attach to a new post: owned by the author, ready,
   * within size limits, not on another post, and of allowed types.
   */
  private async newAttachments(
    authorId: string,
    input: AttachmentInputDto[],
  ): Promise<PostAttachment[]> {
    const ids = input.map((item) => item.mediaId);
    assertUnique(input);

    const media = await this.media.findReadyOwnedByIds(ids, authorId);
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !mediaById.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Media not found, not yours or not ready: ${missing.join(', ')}`,
      );
    }
    for (const item of media) {
      this.assertWithinSizeLimit(item);
    }
    if (await this.posts.isMediaAttachedElsewhere(ids)) {
      throw new ConflictException('Some media is already used by another post');
    }

    const attachments = toAttachments(
      input,
      (id) => mediaById.get(id)!.mediaType,
    );
    if (!ALLOW_MIXED_MEDIA_TYPES && distinctTypes(attachments).length > 1) {
      throw new BadRequestException(
        'A post cannot mix photos, videos and documents',
      );
    }
    return attachments;
  }

  private assertWithinSizeLimit(media: MediaEntity): void {
    const limit = this.maxBytes[media.mediaType];
    if (media.size > limit) {
      throw new BadRequestException(
        `${media.fileName} is larger than ${limit / MB} MB`,
      );
    }
  }

  private async assertCanView(
    post: PostEntity,
    callerId?: string,
  ): Promise<void> {
    if (
      callerId &&
      (await this.blocks.isBlockedEitherWay(callerId, post.authorId))
    ) {
      // Hidden, as if it didn't exist.
      throw new NotFoundException('Post not found');
    }
    if (post.visibility === PostVisibility.Public) {
      return;
    }
    if (!callerId) {
      throw new UnauthorizedException('Sign in to see this post');
    }
    if (!(await this.canSeeFollowersOnly(post.authorId, callerId))) {
      throw new ForbiddenException('Only followers can see this post');
    }
  }

  /** The same rules as GET /posts/:postId, as a yes/no answer. */
  async canView(post: PostEntity, callerId?: string): Promise<boolean> {
    if (post.deletedAt) return false;
    if (
      callerId &&
      (await this.blocks.isBlockedEitherWay(callerId, post.authorId))
    ) {
      return false;
    }
    if (post.visibility === PostVisibility.Public) return true;
    return !!callerId && this.canSeeFollowersOnly(post.authorId, callerId);
  }

  private async canSeeFollowersOnly(
    authorId: string,
    callerId: string,
  ): Promise<boolean> {
    return (
      authorId === callerId ||
      (await this.follows.exists({
        followerId: callerId,
        followingId: authorId,
      }))
    );
  }

  private async ownPost(postId: string, callerId: string): Promise<PostEntity> {
    const post = await this.posts.findActiveById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== callerId) {
      throw new ForbiddenException('Only the author can change this post');
    }
    return post;
  }

  private async present(
    post: PostEntity,
    callerId?: string,
  ): Promise<PostResponseDto> {
    const response = await this.presenter.presentOne(post, callerId);
    if (!response) {
      throw new NotFoundException('Post not found');
    }
    return response;
  }
}

/**
 * PATCH may only reorder or remove the post's own attachments: any media id
 * not already on the post is rejected, so attachments can't be swapped.
 */
function reorderAttachments(
  post: PostEntity,
  input: AttachmentInputDto[],
): PostAttachment[] {
  assertUnique(input);
  const current = new Map(
    post.attachments.map((item) => [item.mediaId.toString(), item]),
  );
  const unknown = input.filter((item) => !current.has(item.mediaId));
  if (unknown.length > 0) {
    throw new BadRequestException(
      'Only existing attachments can be reordered or removed; create a new ' +
        'post to add media',
    );
  }
  return toAttachments(input, (id) => current.get(id)!.mediaType);
}

function assertUnique(input: AttachmentInputDto[]): void {
  if (new Set(input.map((item) => item.mediaId)).size !== input.length) {
    throw new BadRequestException('Each media can be attached only once');
  }
  if (new Set(input.map((item) => item.sortOrder)).size !== input.length) {
    throw new BadRequestException('Each attachment needs its own sortOrder');
  }
}

// Stored as 0..n-1 in the requested order, so gaps never reach clients.
function toAttachments(
  input: AttachmentInputDto[],
  typeOf: (mediaId: string) => MediaType,
): PostAttachment[] {
  return [...input]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      mediaId: new Types.ObjectId(item.mediaId),
      mediaType: typeOf(item.mediaId),
      sortOrder: index,
    }));
}

function distinctTypes(attachments: PostAttachment[]): MediaType[] {
  return [...new Set(attachments.map((item) => item.mediaType))];
}
