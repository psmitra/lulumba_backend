import type { MediaEntity } from '@app-types/media.types.js';
import type { PostEntity } from '@app-types/post.types.js';
import { StorageService } from '@common/services/storage.service.js';
import { BookmarkRepository } from '@database/repositories/bookmark.repository.js';
import { LikeRepository } from '@database/repositories/like.repository.js';
import { MediaRepository } from '@database/repositories/media.repository.js';
import { ProfileSummaryDto } from '@modules/profiles/dto/profile-summary.dto.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import { Injectable } from '@nestjs/common';
import type {
  AttachmentResponseDto,
  PostResponseDto,
} from '../dto/post-response.dto.js';

/**
 * Turns posts into API responses. Works on a whole page at once: authors,
 * media, likes and bookmarks are each loaded in one query, never per post.
 */
@Injectable()
export class PostPresenter {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly media: MediaRepository,
    private readonly likes: LikeRepository,
    private readonly bookmarks: BookmarkRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Posts whose author profile is gone or disabled are left out, so the
   * result can be shorter than `posts`.
   */
  async present(
    posts: PostEntity[],
    callerId?: string,
  ): Promise<PostResponseDto[]> {
    if (posts.length === 0) {
      return [];
    }
    const postIds = posts.map((post) => post.id);
    const [authors, media, likedIds, savedIds] = await Promise.all([
      this.profiles.findByExternalUserIds([
        ...new Set(posts.map((post) => post.authorId)),
      ]),
      this.media.findActiveByIds(
        posts.flatMap((post) =>
          post.attachments.map((item) => item.mediaId.toString()),
        ),
      ),
      callerId ? this.likes.findLikedPostIds(callerId, postIds) : [],
      callerId ? this.bookmarks.findSavedPostIds(callerId, postIds) : [],
    ]);

    const authorsById = new Map(authors.map((a) => [a.externalUserId, a]));
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const liked = new Set(likedIds);
    const saved = new Set(savedIds);

    const responses: PostResponseDto[] = [];
    for (const post of posts) {
      const author = authorsById.get(post.authorId);
      if (!author?.isActive) continue;
      responses.push({
        id: post.id,
        author: ProfileSummaryDto.fromEntity(author),
        caption: post.caption || null,
        visibility: post.visibility,
        attachments: this.attachments(post, mediaById),
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        sharesCount: post.sharesCount,
        isLiked: liked.has(post.id),
        isSaved: saved.has(post.id),
        isMine: post.authorId === callerId,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      });
    }
    return responses;
  }

  async presentOne(
    post: PostEntity,
    callerId?: string,
  ): Promise<PostResponseDto | null> {
    const [response] = await this.present([post], callerId);
    return response ?? null;
  }

  // Media deleted since posting is skipped rather than shown broken.
  private attachments(
    post: PostEntity,
    mediaById: Map<string, MediaEntity>,
  ): AttachmentResponseDto[] {
    return [...post.attachments]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((attachment) => {
        const media = mediaById.get(attachment.mediaId.toString());
        if (!media) return [];
        return [
          {
            mediaId: media.id,
            mediaType: media.mediaType,
            sortOrder: attachment.sortOrder,
            url: this.storage.getUrl(media.storageKey),
            thumbnailUrl: media.thumbnailKey
              ? this.storage.getUrl(media.thumbnailKey)
              : null,
            mimeType: media.mimeType,
            fileName: media.fileName,
            size: media.size,
            width: media.width ?? null,
            height: media.height ?? null,
            durationSeconds: media.durationSeconds ?? null,
          },
        ];
      });
  }
}
