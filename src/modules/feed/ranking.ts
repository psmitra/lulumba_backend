import { FEED_RANKING } from './feed.constants.js';

/** What the score of one post is computed from. */
export interface RankingSignals {
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  createdAt: Date;
  // The viewer's recent likes, comments and shares on this post's author.
  authorInteractions: number;
}

const HOUR_MS = 3_600_000;

/** How much people engaged with the post. Never below 1. */
export function engagement(signals: RankingSignals): number {
  const { weights } = FEED_RANKING;
  return (
    1 +
    signals.likesCount * weights.like +
    signals.commentsCount * weights.comment +
    signals.sharesCount * weights.share +
    signals.savesCount * weights.save
  );
}

/** 1 / (ageHours + offset) ^ gravity: halves roughly every few hours. */
export function freshness(createdAt: Date, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - createdAt.getTime()) / HOUR_MS);
  return 1 / (ageHours + FEED_RANKING.ageOffsetHours) ** FEED_RANKING.gravity;
}

/** How close the viewer is to the author: 1 (strangers) up to 4. */
export function affinity(interactions: number): number {
  return (
    1 +
    FEED_RANKING.affinityPerInteraction *
      Math.min(interactions, FEED_RANKING.affinityMaxInteractions)
  );
}

/** score = engagement × affinity × freshness */
export function feedScore(signals: RankingSignals, now: Date): number {
  return (
    engagement(signals) *
    affinity(signals.authorInteractions) *
    freshness(signals.createdAt, now)
  );
}

/**
 * Reorders `items` so no author appears more than `maxRun` times in a row,
 * moving the fewest posts possible: each slot takes the best remaining post
 * that doesn't break the rule. Falls back to the best post when every
 * remaining one is by the same author.
 */
export function spreadAuthors<T extends { authorId: string }>(
  items: T[],
  maxRun: number,
): T[] {
  const pending = [...items];
  const result: T[] = [];
  while (pending.length > 0) {
    const run = result.slice(-maxRun);
    const blocked =
      run.length === maxRun && run.every((i) => i.authorId === run[0]!.authorId)
        ? run[0]!.authorId
        : null;
    const index = pending.findIndex((item) => item.authorId !== blocked);
    result.push(pending.splice(Math.max(index, 0), 1)[0]!);
  }
  return result;
}

/**
 * Puts one `extra` item into every `every`th slot of `primary` (slots
 * every, 2·every, ...). Leftover extras go at the end, so a viewer with
 * little primary content still gets a full feed.
 */
export function mixIn<T>(primary: T[], extra: T[], every: number): T[] {
  const result: T[] = [];
  const extras = [...extra];
  for (const item of primary) {
    if ((result.length + 1) % every === 0 && extras.length > 0) {
      result.push(extras.shift()!);
    }
    result.push(item);
  }
  return [...result, ...extras];
}
