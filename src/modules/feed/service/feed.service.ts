import { MediaStatus, type MediaType } from '@app-types/media.types.js';
import type { PostEntity } from '@app-types/post.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import type { CursorQueryDto } from '@common/dto/cursor-query.dto.js';
import type { CursorMeta } from '@common/response/response.interface.js';
import { cursorMeta, parseCursorQuery } from '@common/utils/cursor.util.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { BlockRepository } from '@database/repositories/block.repository.js';
import { FeedSnapshotRepository } from '@database/repositories/feed-snapshot.repository.js';
import { FollowRepository } from '@database/repositories/follow.repository.js';
import { MediaRepository } from '@database/repositories/media.repository.js';
import {
  PostRepository,
  type PreScoreWeights,
} from '@database/repositories/post.repository.js';
import { ReportRepository } from '@database/repositories/report.repository.js';
import type { Post } from '@database/schemas/post.schema.js';
import type { PostResponseDto } from '@modules/posts/dto/post-response.dto.js';
import {
  MEDIA_TYPE_FOR_FILTER,
  type PostTypeFilter,
} from '@modules/posts/posts.constants.js';
import { PostPresenter } from '@modules/posts/service/post-presenter.service.js';
import { GoneException, Injectable } from '@nestjs/common';
import { Types, type QueryFilter } from 'mongoose';
import type {
  LatestFeedQueryDto,
  SectionFeedQueryDto,
} from '../dto/feed-query.dto.js';
import { encodeRankedCursor, parseRankedCursor } from '../feed-cursor.js';
import { FEED_RANKING, FEED_RULES, FeedSort } from '../feed.constants.js';
import { mixIn, spreadAuthors } from '../ranking.js';
import { FeedRanker } from './feed-ranker.service.js';

export interface FeedPage {
  items: PostResponseDto[];
  meta: CursorMeta;
}

/** Who is asking, and what must never reach them. Loaded once per request. */
interface Viewer {
  id: string;
  following: Set<string>;
  // Blocked either way, or reported by the viewer.
  hiddenAuthors: string[];
  reportedPostIds: string[];
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const PRE_SCORE: PreScoreWeights = {
  ...FEED_RANKING.weights,
  ageOffsetHours: FEED_RANKING.ageOffsetHours,
  gravity: FEED_RANKING.gravity,
};

/**
 * All feeds. Chronological feeds (latest, sections by `latest`) page on
 * `createdAt`. Ranked feeds (home, recommended, sections by `popular`)
 * rank once on the first page and page through that frozen order (a
 * FeedSnapshot), so scores changing between requests never repeat or skip
 * posts. Rules are explained in README.md next to this module.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly posts: PostRepository,
    private readonly follows: FollowRepository,
    private readonly blocks: BlockRepository,
    private readonly reports: ReportRepository,
    private readonly media: MediaRepository,
    private readonly snapshots: FeedSnapshotRepository,
    private readonly ranker: FeedRanker,
    private readonly presenter: PostPresenter,
  ) {}

  /** Followed authors and your own posts, ranked, with discovery mixed in. */
  home(userId: string, query: CursorQueryDto): Promise<FeedPage> {
    return this.ranked('home', userId, query, (viewer) =>
      this.homeOrder(viewer),
    );
  }

  /** Popular recent public posts from authors you don't follow. */
  recommended(userId: string, query: CursorQueryDto): Promise<FeedPage> {
    return this.ranked('recommended', userId, query, async (viewer) => {
      const now = new Date();
      const candidates = await this.discoveryCandidates(
        viewer,
        FEED_RULES.recommendedCandidates,
      );
      const ranked = await this.ranker.rank(candidates, viewer.id, now, {
        withAffinity: false,
      });
      return spreadAuthors(ranked, FEED_RULES.maxSameAuthorInARow);
    });
  }

  /** Everything you may see, newest first. */
  async latest(userId: string, query: LatestFeedQueryDto): Promise<FeedPage> {
    return this.chronological(
      userId,
      query,
      query.type ? MEDIA_TYPE_FOR_FILTER[query.type] : undefined,
    );
  }

  /** Videos / Pictures / Scripts: posts with a ready attachment of `type`. */
  section(
    userId: string,
    type: PostTypeFilter,
    query: SectionFeedQueryDto,
  ): Promise<FeedPage> {
    const mediaType = MEDIA_TYPE_FOR_FILTER[type];
    if (query.sort !== FeedSort.Popular) {
      return this.chronological(userId, query, mediaType, true);
    }
    return this.ranked(
      `section:${type}`,
      userId,
      query,
      async (viewer) => {
        const now = new Date();
        const candidates = await this.posts.findTopCandidates(
          {
            $and: [
              this.notHidden(viewer),
              this.visibleTo(viewer),
              {
                mediaTypes: mediaType,
                createdAt: {
                  $gte: daysAgo(now, FEED_RULES.sectionPopularWindowDays),
                },
              },
            ],
          },
          FEED_RULES.sectionPopularCandidates,
          PRE_SCORE,
        );
        const ranked = await this.ranker.rank(candidates, viewer.id, now, {
          withAffinity: false,
        });
        return spreadAuthors(ranked, FEED_RULES.maxSameAuthorInARow);
      },
      mediaType,
    );
  }

  private async homeOrder(viewer: Viewer): Promise<PostEntity[]> {
    const now = new Date();
    const [following, discovery] = await Promise.all([
      this.posts.findTopCandidates(
        {
          $and: [
            this.notHidden(viewer),
            {
              authorId: { $in: [viewer.id, ...viewer.following] },
              createdAt: { $gte: daysAgo(now, FEED_RULES.homeWindowDays) },
            },
          ],
        },
        FEED_RULES.homeFollowingCandidates,
        PRE_SCORE,
      ),
      this.discoveryCandidates(viewer, FEED_RULES.homeDiscoveryCandidates),
    ]);
    const [rankedFollowing, rankedDiscovery] = await Promise.all([
      this.ranker.rank(following, viewer.id, now, { withAffinity: true }),
      this.ranker.rank(discovery, viewer.id, now, { withAffinity: false }),
    ]);

    // What you just posted comes first, newest first.
    const pinSince = now.getTime() - FEED_RULES.ownPostPinMinutes * MINUTE_MS;
    const isPinned = (post: PostEntity) =>
      post.authorId === viewer.id && post.createdAt.getTime() >= pinSince;
    const pinned = rankedFollowing
      .filter(isPinned)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const rest = rankedFollowing.filter((post) => !isPinned(post));

    const maxRun = FEED_RULES.maxSameAuthorInARow;
    return [
      ...pinned,
      ...mixIn(
        spreadAuthors(rest, maxRun),
        spreadAuthors(rankedDiscovery, maxRun),
        FEED_RULES.homeDiscoveryEvery,
      ),
    ];
  }

  /** Recent public posts by people the viewer doesn't follow (nor self). */
  private discoveryCandidates(
    viewer: Viewer,
    limit: number,
  ): Promise<PostEntity[]> {
    return this.posts.findTopCandidates(
      {
        $and: [
          this.notHidden(viewer),
          {
            visibility: PostVisibility.Public,
            authorId: { $nin: [viewer.id, ...viewer.following] },
            createdAt: {
              $gte: daysAgo(new Date(), FEED_RULES.recommendedWindowDays),
            },
          },
        ],
      },
      limit,
      PRE_SCORE,
    );
  }

  private async chronological(
    userId: string,
    query: CursorQueryDto,
    mediaType?: MediaType,
    requireReadyMedia = false,
  ): Promise<FeedPage> {
    const after = parseCursorQuery(query.cursor);
    const viewer = await this.viewer(userId);
    const filters: QueryFilter<Post>[] = [
      this.notHidden(viewer),
      this.visibleTo(viewer),
    ];
    if (mediaType) filters.push({ mediaTypes: mediaType });

    const page = await this.posts.findCursorPage(
      { $and: filters },
      query.limit,
      after,
    );
    return {
      items: await this.finish(
        page.items,
        viewer,
        requireReadyMedia ? mediaType : undefined,
      ),
      // From the raw page, so filtered-out posts never end the feed early.
      meta: cursorMeta(page, query.limit),
    };
  }

  /**
   * First page: `order` ranks the feed and the order is saved. Later pages
   * read the saved order; an expired one is 410 so the app reloads.
   */
  private async ranked(
    feed: string,
    userId: string,
    query: CursorQueryDto,
    order: (viewer: Viewer) => Promise<PostEntity[]>,
    readyMediaType?: MediaType,
  ): Promise<FeedPage> {
    const position = parseRankedCursor(query.cursor);
    const viewer = await this.viewer(userId);

    let snapshotId: string;
    let postIds: string[];
    if (position) {
      const snapshot = await this.snapshots.findLive(
        position.snapshotId,
        userId,
        feed,
      );
      if (!snapshot) {
        throw new GoneException(
          'This feed has expired; load it again from the first page',
        );
      }
      snapshotId = snapshot.id;
      postIds = snapshot.postIds.map((id) => id.toString());
    } else {
      postIds = (await order(viewer)).map((post) => post.id);
      if (postIds.length === 0) {
        return {
          items: [],
          meta: { limit: query.limit, nextCursor: null, hasMore: false },
        };
      }
      const snapshot = await this.snapshots.create({
        userId,
        feed,
        postIds: postIds.map((id) => new Types.ObjectId(id)),
        expiresAt: new Date(
          Date.now() + FEED_RULES.snapshotTtlMinutes * MINUTE_MS,
        ),
      });
      snapshotId = snapshot.id;
    }

    const offset = position?.offset ?? 0;
    const pageIds = postIds.slice(offset, offset + query.limit);
    // Re-read: posts can be deleted or edited after the snapshot was taken.
    const posts = await this.posts.findAll({
      _id: { $in: pageIds },
      deletedAt: null,
    });
    const byId = new Map(posts.map((post) => [post.id, post]));
    const inOrder = pageIds.flatMap((id) => byId.get(id) ?? []);

    const next = offset + query.limit;
    const hasMore = next < postIds.length;
    return {
      items: await this.finish(inOrder, viewer, readyMediaType),
      meta: {
        limit: query.limit,
        nextCursor: hasMore
          ? encodeRankedCursor({ snapshotId, offset: next })
          : null,
        hasMore,
      },
    };
  }

  /**
   * The last checks before posts are shown, for every feed: blocks,
   * visibility, your reports, heavily reported posts and, for sections,
   * a ready attachment of the section's type. Then the post cards.
   */
  private async finish(
    posts: PostEntity[],
    viewer: Viewer,
    readyMediaType?: MediaType,
  ): Promise<PostResponseDto[]> {
    const hidden = new Set(viewer.hiddenAuthors);
    const reported = new Set(viewer.reportedPostIds);
    let visible = posts.filter(
      (post) =>
        !hidden.has(post.authorId) &&
        !reported.has(post.id) &&
        (post.visibility === PostVisibility.Public ||
          post.authorId === viewer.id ||
          viewer.following.has(post.authorId)),
    );

    // Authors still see their own reported posts.
    const flagged = new Set(
      await this.reports.findPostIdsWithOpenReports(
        visible
          .filter((post) => post.authorId !== viewer.id)
          .map((post) => post.id),
        FEED_RULES.reportHideThreshold,
      ),
    );
    visible = visible.filter((post) => !flagged.has(post.id));

    if (readyMediaType) {
      visible = await this.withReadyMedia(visible, readyMediaType);
    }
    return this.presenter.present(visible, viewer.id);
  }

  /** Posts with at least one ready, undeleted attachment of `type`. */
  private async withReadyMedia(
    posts: PostEntity[],
    type: MediaType,
  ): Promise<PostEntity[]> {
    const attachmentsOf = (post: PostEntity) =>
      post.attachments
        .filter((item) => item.mediaType === type)
        .map((item) => item.mediaId.toString());
    const media = await this.media.findActiveByIds(
      posts.flatMap(attachmentsOf),
    );
    const ready = new Set(
      media
        .filter((item) => item.status === MediaStatus.Ready)
        .map((item) => item.id),
    );
    return posts.filter((post) =>
      attachmentsOf(post).some((id) => ready.has(id)),
    );
  }

  private async viewer(userId: string): Promise<Viewer> {
    const [blocked, following, reported] = await Promise.all([
      this.blocks.findHiddenUserIds(userId),
      this.follows.findFollowingIds(userId, FEED_RULES.maxFollowingForFeed),
      this.reports.findReportedTargets(userId, FEED_RULES.maxReportsForFeed),
    ]);
    return {
      id: userId,
      following: new Set(following),
      hiddenAuthors: [...new Set([...blocked, ...reported.userIds])],
      reportedPostIds: reported.postIds.filter(isValidObjectId),
    };
  }

  /**
   * Not deleted, not by a hidden author, not reported by the viewer. Ids are
   * ObjectIds because this also feeds aggregations, which don't cast.
   */
  private notHidden(viewer: Viewer): QueryFilter<Post> {
    const filter: QueryFilter<Post> = { deletedAt: null };
    if (viewer.hiddenAuthors.length > 0) {
      filter.authorId = { $nin: viewer.hiddenAuthors };
    }
    if (viewer.reportedPostIds.length > 0) {
      filter._id = {
        $nin: viewer.reportedPostIds.map((id) => new Types.ObjectId(id)),
      };
    }
    return filter;
  }

  /** Public posts, plus followers-only posts of people you follow and you. */
  private visibleTo(viewer: Viewer): QueryFilter<Post> {
    return {
      $or: [
        { visibility: PostVisibility.Public },
        { authorId: { $in: [viewer.id, ...viewer.following] } },
      ],
    };
  }
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
