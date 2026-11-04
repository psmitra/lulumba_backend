import type { PostEntity } from '@app-types/post.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import type { CursorMeta } from '@common/response/response.interface.js';
import { cursorMeta, parseCursorQuery } from '@common/utils/cursor.util.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { BookmarkRepository } from '@database/repositories/bookmark.repository.js';
import { FollowRepository } from '@database/repositories/follow.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import { MEDIA_TYPE_FOR_FILTER } from '@modules/posts/posts.constants.js';
import { PostPresenter } from '@modules/posts/service/post-presenter.service.js';
import { PostsService } from '@modules/posts/service/posts.service.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  BookmarkItemDto,
  BookmarkStateDto,
  ListBookmarksQueryDto,
} from '../dto/bookmark.dto.js';

/** The Shortlist: a user's private list of saved posts. */
@Injectable()
export class BookmarksService {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly posts: PostRepository,
    private readonly blocks: BlockRepository,
    private readonly follows: FollowRepository,
    private readonly postsService: PostsService,
    private readonly presenter: PostPresenter,
  ) {}

  /** Idempotent: the unique (userId, postId) index allows one bookmark. */
  async save(postId: string, userId: string): Promise<BookmarkStateDto> {
    const post = await this.posts.findActiveById(postId);
    if (!post || !(await this.postsService.canView(post, userId))) {
      throw new NotFoundException('Post not found');
    }
    try {
      await this.bookmarks.create({
        userId,
        postId: new Types.ObjectId(post.id),
      });
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) throw error;
    }
    return { saved: true };
  }

  /** Idempotent, and works for posts deleted or hidden since saving. */
  async unsave(postId: string, userId: string): Promise<BookmarkStateDto> {
    await this.bookmarks.deletePair(userId, postId);
    return { saved: false };
  }

  /**
   * Newest saves first. Deleted posts, and posts the user may no longer see
   * (blocked author, unfollowed followers-only author), are left out.
   */
  async list(
    userId: string,
    query: ListBookmarksQueryDto,
  ): Promise<{ items: BookmarkItemDto[]; meta: CursorMeta }> {
    const page = await this.bookmarks.findShortlistPage(userId, query.limit, {
      after: parseCursorQuery(query.cursor),
      mediaType: query.type ? MEDIA_TYPE_FOR_FILTER[query.type] : undefined,
    });

    const posts = await this.posts.findAll({
      _id: { $in: page.items.map((bookmark) => bookmark.postId) },
      deletedAt: null,
    });
    const visible = await this.stillVisible(posts, userId);
    const presented = await this.presenter.present(visible, userId);
    const byId = new Map(presented.map((post) => [post.id, post]));

    const items: BookmarkItemDto[] = [];
    for (const bookmark of page.items) {
      const post = byId.get(bookmark.postId.toString());
      if (post) items.push({ post, savedAt: bookmark.createdAt });
    }
    return { items, meta: cursorMeta(page, query.limit) };
  }

  /** Visibility and block rules for a whole page, in two queries. */
  private async stillVisible(
    posts: PostEntity[],
    userId: string,
  ): Promise<PostEntity[]> {
    const followersOnlyAuthors = posts
      .filter(
        (post) =>
          post.visibility === PostVisibility.Followers &&
          post.authorId !== userId,
      )
      .map((post) => post.authorId);
    const [hidden, followed] = await Promise.all([
      this.blocks.findHiddenUserIds(userId),
      this.follows.findFollowedIds(userId, [...new Set(followersOnlyAuthors)]),
    ]);
    const hiddenSet = new Set(hidden);
    const followedSet = new Set(followed);
    return posts.filter(
      (post) =>
        !hiddenSet.has(post.authorId) &&
        (post.visibility === PostVisibility.Public ||
          post.authorId === userId ||
          followedSet.has(post.authorId)),
    );
  }
}
