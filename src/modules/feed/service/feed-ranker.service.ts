import type { PostEntity } from '@app-types/post.types.js';
import { BookmarkRepository } from '@database/repositories/bookmark.repository.js';
import { CommentRepository } from '@database/repositories/comment.repository.js';
import { LikeRepository } from '@database/repositories/like.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import { ShareRepository } from '@database/repositories/share.repository.js';
import { Injectable } from '@nestjs/common';
import { FEED_RANKING } from '../feed.constants.js';
import { feedScore } from '../ranking.js';

const DAY_MS = 86_400_000;

/**
 * Scores candidate posts with `feedScore` (ranking.ts). Loads the signals
 * that aren't on the post itself - saves and the viewer's affinity to each
 * author - in a few queries per feed, never per post.
 */
@Injectable()
export class FeedRanker {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly likes: LikeRepository,
    private readonly comments: CommentRepository,
    private readonly shares: ShareRepository,
    private readonly posts: PostRepository,
  ) {}

  /**
   * `posts` best first. Without `withAffinity` every author counts as a
   * stranger, so the order is the same for every viewer.
   */
  async rank(
    posts: PostEntity[],
    viewerId: string,
    now: Date,
    { withAffinity }: { withAffinity: boolean },
  ): Promise<PostEntity[]> {
    if (posts.length === 0) {
      return [];
    }
    const [saves, interactions] = await Promise.all([
      this.bookmarks.countByPostIds(posts.map((post) => post.id)),
      withAffinity
        ? this.authorInteractions(viewerId, now)
        : new Map<string, number>(),
    ]);
    return posts
      .map((post) => ({
        post,
        score: feedScore(
          {
            likesCount: post.likesCount,
            commentsCount: post.commentsCount,
            sharesCount: post.sharesCount,
            savesCount: saves.get(post.id) ?? 0,
            createdAt: post.createdAt,
            authorInteractions: interactions.get(post.authorId) ?? 0,
          },
          now,
        ),
      }))
      .sort((a, b) => b.score - a.score || b.post.id.localeCompare(a.post.id))
      .map(({ post }) => post);
  }

  /**
   * How many times the viewer liked, commented on or shared each author's
   * posts in the affinity window. Their own posts don't count.
   */
  private async authorInteractions(
    viewerId: string,
    now: Date,
  ): Promise<Map<string, number>> {
    const since = new Date(
      now.getTime() - FEED_RANKING.affinityWindowDays * DAY_MS,
    );
    const limit = FEED_RANKING.affinityHistoryLimit;
    const history = (
      await Promise.all([
        this.likes.findRecentPostIdsBy(viewerId, since, limit),
        this.comments.findRecentPostIdsBy(viewerId, since, limit),
        this.shares.findRecentPostIdsBy(viewerId, since, limit),
      ])
    ).flat();
    const authors = await this.posts.findAuthorIds(history);

    const counts = new Map<string, number>();
    for (const postId of history) {
      const author = authors.get(postId);
      if (!author || author === viewerId) continue;
      counts.set(author, (counts.get(author) ?? 0) + 1);
    }
    return counts;
  }
}
