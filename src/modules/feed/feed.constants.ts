/**
 * Every number the feeds use, in one place. README.md in this folder
 * explains each rule; keep the two in step when tuning.
 */

/** How a post's score is computed (see ranking.ts). */
export const FEED_RANKING = {
  // engagement = 1 + likes·like + comments·comment + shares·share + saves·save
  weights: { like: 1, comment: 2, share: 3, save: 2 },
  // freshness = 1 / (ageHours + ageOffsetHours) ^ gravity
  ageOffsetHours: 2,
  gravity: 1.5,
  // affinity = 1 + perInteraction · min(interactions, maxInteractions)
  affinityPerInteraction: 0.25,
  affinityMaxInteractions: 12,
  affinityWindowDays: 30,
  // Recent likes, comments and shares each read for affinity.
  affinityHistoryLimit: 300,
} as const;

/** Which posts a feed considers, and how it arranges them. */
export const FEED_RULES = {
  // Home: followed authors' (and your own) posts from this many days.
  homeWindowDays: 30,
  homeFollowingCandidates: 400,
  homeDiscoveryCandidates: 100,
  // Every Nth home slot is a discovery post (when there are any).
  homeDiscoveryEvery: 5,
  // Your own posts younger than this go to the top of home.
  ownPostPinMinutes: 60,
  // Recommended: public posts from authors you don't follow.
  recommendedWindowDays: 7,
  recommendedCandidates: 400,
  // Videos / Pictures / Scripts with ?sort=popular.
  sectionPopularWindowDays: 30,
  sectionPopularCandidates: 400,
  // Never more than this many posts in a row from one author.
  maxSameAuthorInARow: 2,
  // A ranked feed's order is kept this long for paging.
  snapshotTtlMinutes: 30,
  // Posts with this many open (unreviewed) reports leave every feed.
  reportHideThreshold: 3,
  // Caps on per-viewer lists read for every request.
  maxFollowingForFeed: 5000,
  maxReportsForFeed: 1000,
} as const;

/** `?sort=` of the Videos / Pictures / Scripts sections. */
export enum FeedSort {
  Latest = 'latest',
  Popular = 'popular',
}
