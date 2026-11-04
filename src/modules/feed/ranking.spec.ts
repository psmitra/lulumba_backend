import { BadRequestException } from '@nestjs/common';
import { encodeRankedCursor, parseRankedCursor } from './feed-cursor.js';
import {
  affinity,
  engagement,
  feedScore,
  freshness,
  mixIn,
  spreadAuthors,
  type RankingSignals,
} from './ranking.js';

const now = new Date('2026-11-05T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const signals = (overrides: Partial<RankingSignals> = {}): RankingSignals => ({
  likesCount: 0,
  commentsCount: 0,
  sharesCount: 0,
  savesCount: 0,
  createdAt: now,
  authorInteractions: 0,
  ...overrides,
});

describe('feed ranking', () => {
  it('weighs comments, shares and saves above likes', () => {
    expect(engagement(signals())).toBe(1);
    expect(
      engagement(
        signals({
          likesCount: 1,
          commentsCount: 1,
          sharesCount: 1,
          savesCount: 1,
        }),
      ),
    ).toBe(1 + 1 + 2 + 3 + 2);
  });

  it('decays with age and never rewards future dates', () => {
    expect(freshness(now, now)).toBeCloseTo(1 / 2 ** 1.5);
    expect(freshness(hoursAgo(2), now)).toBeCloseTo(1 / 4 ** 1.5);
    expect(freshness(hoursAgo(-5), now)).toBe(freshness(now, now));
  });

  it('caps affinity at 4x', () => {
    expect(affinity(0)).toBe(1);
    expect(affinity(4)).toBe(2);
    expect(affinity(12)).toBe(4);
    expect(affinity(500)).toBe(4);
  });

  it('lets a fresh post beat an older, busier one', () => {
    const fresh = feedScore(
      signals({ likesCount: 5, createdAt: hoursAgo(2) }),
      now,
    );
    const old = feedScore(
      signals({ likesCount: 50, createdAt: hoursAgo(72) }),
      now,
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it('keeps one author from filling the feed', () => {
    const post = (id: string, authorId: string) => ({ id, authorId });
    const ranked = [
      post('a1', 'a'),
      post('a2', 'a'),
      post('a3', 'a'),
      post('b1', 'b'),
      post('a4', 'a'),
    ];
    expect(spreadAuthors(ranked, 2).map((p) => p.id)).toEqual([
      'a1',
      'a2',
      'b1',
      'a3',
      'a4',
    ]);
    // Only one author left: keep going rather than drop posts.
    expect(spreadAuthors(ranked.slice(0, 3), 2)).toHaveLength(3);
  });

  it('mixes one extra into every nth slot and appends the rest', () => {
    expect(mixIn(['p1', 'p2', 'p3', 'p4', 'p5'], ['x1', 'x2'], 3)).toEqual([
      'p1',
      'p2',
      'x1',
      'p3',
      'p4',
      'x2',
      'p5',
    ]);
    expect(mixIn([], ['x1', 'x2'], 5)).toEqual(['x1', 'x2']);
  });
});

describe('ranked cursor', () => {
  it('round-trips and rejects anything else', () => {
    const position = { snapshotId: '665f1c2e8b3a4d0012ab34cd', offset: 40 };
    expect(parseRankedCursor(encodeRankedCursor(position))).toEqual(position);
    expect(parseRankedCursor(undefined)).toBeUndefined();

    const encode = (raw: string) => Buffer.from(raw).toString('base64url');
    for (const forged of [
      'nope',
      encode('r|665f1c2e8b3a4d0012ab34cd|'),
      encode('r|665f1c2e8b3a4d0012ab34cd|-1'),
      encode('x|665f1c2e8b3a4d0012ab34cd|0'),
      encode('2026-11-01T10:00:00.000Z|665f1c2e8b3a4d0012ab34cd'),
    ]) {
      expect(() => parseRankedCursor(forged)).toThrow(BadRequestException);
    }
  });
});
