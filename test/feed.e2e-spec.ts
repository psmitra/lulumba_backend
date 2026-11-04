import request from 'supertest';
import { startTestApp, type TestApp, type TestUser } from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_feed_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

type MediaKind = 'image' | 'video' | 'document';

const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const feed = (
  u: TestUser,
  path: string,
  query: Record<string, string | number> = {},
) => request(t.http).get(`/feed/${path}`).set(as(u)).query(query);
const ids = (res: request.Response): string[] =>
  res.body.data.map((post: { id: string }) => post.id);
const follow = (u: TestUser, other: TestUser) =>
  request(t.http).post(`/users/${other.id}/follow`).set(as(u)).expect(200);
const like = (u: TestUser, postId: string) =>
  request(t.http).put(`/posts/${postId}/like`).set(as(u)).expect(200);

/** Every page of a feed, two posts at a time. */
async function allPages(
  u: TestUser,
  path: string,
  query: Record<string, string> = {},
): Promise<string[]> {
  const seen: string[] = [];
  let next: Record<string, string> = {};
  for (;;) {
    const res: request.Response = await feed(u, path, {
      limit: 2,
      ...query,
      ...next,
    }).expect(200);
    seen.push(...ids(res));
    const cursor = res.body.meta.nextCursor as string | null;
    if (!cursor) break;
    next = { cursor };
  }
  return seen;
}

const FILES: Record<MediaKind, { ext: string; mime: string }> = {
  image: { ext: 'webp', mime: 'image/webp' },
  video: { ext: 'mp4', mime: 'video/mp4' },
  document: { ext: 'pdf', mime: 'application/pdf' },
};
let mediaCount = 0;

/** A post with one ready attachment of `kind`. */
async function postWith(
  owner: TestUser,
  kind: MediaKind,
  visibility: 'public' | 'followers' = 'public',
) {
  mediaCount += 1;
  const { ext, mime } = FILES[kind];
  const { insertedId } = await t.connection.collection('media').insertOne({
    ownerId: owner.id,
    mediaType: kind,
    status: 'ready',
    variant: 'original',
    fileName: `file.${ext}`,
    mimeType: mime,
    size: 100,
    storageProvider: 'ftp',
    storageKey: `feed-test/${kind}-${mediaCount}.${ext}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const res = await request(t.http)
    .post('/posts')
    .set(as(owner))
    .send({
      visibility,
      attachments: [{ mediaId: insertedId.toString(), sortOrder: 0 }],
    })
    .expect(201);
  return { postId: res.body.data.id as string, mediaId: insertedId };
}

async function report(reporter: TestUser, postId: string) {
  await t.connection.collection('reports').insertOne({
    reporterId: reporter.id,
    targetType: 'post',
    targetId: postId,
    reason: 'spam',
    status: 'received',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GET /feed/home', () => {
  it('shows followed and own posts, with discovery, and nothing hidden', async () => {
    const [me, friend, stranger, blocked] = [
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
    ];
    await follow(me, friend);
    await follow(me, blocked);
    await t.connection
      .collection('blocks')
      .insertOne({
        blockerId: me.id,
        blockedId: blocked.id,
        createdAt: new Date(),
      });

    const friendPublic = await t.createPost(friend);
    const friendFollowers = await t.createPost(friend, 'followers');
    const deleted = await t.createPost(friend);
    await request(t.http)
      .delete(`/posts/${deleted}`)
      .set(as(friend))
      .expect(200);
    const strangerPublic = await t.createPost(stranger);
    const strangerFollowers = await t.createPost(stranger, 'followers');
    const blockedPost = await t.createPost(blocked);
    const mine = await t.createPost(me);

    const seen = await allPages(me, 'home');
    expect(seen[0]).toBe(mine); // just posted: pinned to the top
    expect(seen).toEqual(
      expect.arrayContaining([friendPublic, friendFollowers, strangerPublic]),
    );
    for (const hidden of [deleted, strangerFollowers, blockedPost]) {
      expect(seen).not.toContain(hidden);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('ranks by engagement, not just by time', async () => {
    const [me, author, fan1, fan2, fan3] = [
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
    ];
    await follow(me, author);
    const popular = await t.createPost(author);
    const newer = await t.createPost(author);
    for (const fan of [fan1, fan2, fan3]) await like(fan, popular);

    const seen = ids(await feed(me, 'home').expect(200));
    expect(seen.indexOf(popular)).toBeLessThan(seen.indexOf(newer));
    expect(seen.indexOf(newer)).toBeGreaterThan(-1);
  });

  it('pages through a frozen order; expired or foreign cursors fail', async () => {
    const [me, author] = [await t.user(), await t.user()];
    await follow(me, author);
    for (let i = 0; i < 3; i++) await t.createPost(author);

    const first = await feed(me, 'home', { limit: 1 }).expect(200);
    const late = await t.createPost(author);
    const rest = await allPages(me, 'home', {
      cursor: first.body.meta.nextCursor,
    });
    expect(rest).not.toContain(late); // arrives on the next refresh
    expect(ids(await feed(me, 'home').expect(200))).toContain(late);

    // Another viewer can't use my cursor.
    const other = await t.user();
    await feed(other, 'home', { cursor: first.body.meta.nextCursor }).expect(
      410,
    );

    await t.connection
      .collection('feed_snapshots')
      .updateMany({ userId: me.id }, { $set: { expiresAt: new Date(0) } });
    const expired = await feed(me, 'home', {
      cursor: first.body.meta.nextCursor,
    }).expect(410);
    expect(expired.body.error.code).toBe('GONE');

    await feed(me, 'home', { cursor: 'forged' }).expect(400);
    const latest = await feed(me, 'latest', { limit: 1 }).expect(200);
    await feed(me, 'home', { cursor: latest.body.meta.nextCursor }).expect(400);
    await request(t.http).get('/feed/home').expect(401);
  });
});

describe('GET /feed/latest', () => {
  it('is newest first, with visibility, type and report rules', async () => {
    const [me, friend, stranger, r1, r2, r3] = [
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
      await t.user(),
    ];
    await follow(me, friend);
    const older = await t.createPost(stranger);
    const friendFollowers = await t.createPost(friend, 'followers');
    const strangerFollowers = await t.createPost(stranger, 'followers');
    const reportedByMe = await t.createPost(stranger);
    const flagged = await t.createPost(stranger);
    const { postId: document } = await postWith(stranger, 'document');
    const mine = await t.createPost(me);
    await report(me, reportedByMe);
    for (const reporter of [r1, r2, r3]) await report(reporter, flagged);

    const seen = await allPages(me, 'latest');
    expect(seen).toEqual(
      expect.arrayContaining([older, friendFollowers, document, mine]),
    );
    expect(seen.indexOf(mine)).toBeLessThan(seen.indexOf(older));
    for (const hidden of [strangerFollowers, reportedByMe, flagged]) {
      expect(seen).not.toContain(hidden);
    }
    // The author still sees their own reported post.
    expect(await allPages(stranger, 'latest')).toContain(flagged);

    expect(await allPages(me, 'latest', { type: 'document' })).toEqual(
      expect.arrayContaining([document]),
    );
    expect(await allPages(me, 'latest', { type: 'document' })).not.toContain(
      mine,
    );
    await feed(me, 'latest', { type: 'audio' }).expect(400);
  });
});

describe('GET /feed/recommended', () => {
  it("only has public posts from people you don't follow", async () => {
    const [me, friend, stranger] = [
      await t.user(),
      await t.user(),
      await t.user(),
    ];
    await follow(me, friend);
    const friendPost = await t.createPost(friend);
    const strangerPublic = await t.createPost(stranger);
    const strangerFollowers = await t.createPost(stranger, 'followers');
    const mine = await t.createPost(me);

    const seen = await allPages(me, 'recommended');
    expect(seen).toContain(strangerPublic);
    for (const excluded of [friendPost, strangerFollowers, mine]) {
      expect(seen).not.toContain(excluded);
    }
  });
});

describe('GET /feed/videos | pictures | documents', () => {
  it('only lists ready media of the section type', async () => {
    const [me, author] = [await t.user(), await t.user()];
    const { postId: video } = await postWith(author, 'video');
    const broken = await postWith(author, 'video');
    await t.connection
      .collection('media')
      .updateOne({ _id: broken.mediaId }, { $set: { status: 'processing' } });
    const { postId: photo } = await postWith(author, 'image');
    const { postId: script } = await postWith(author, 'document');

    const videos = await allPages(me, 'videos');
    expect(videos).toContain(video);
    expect(videos).not.toContain(broken.postId);
    expect(videos).not.toContain(photo);

    const pictures = await allPages(me, 'pictures');
    expect(pictures).toContain(photo);
    expect(pictures).not.toContain(video);

    const scripts = await allPages(me, 'documents');
    expect(scripts).toContain(script);
    expect(scripts).not.toContain(photo);
  });

  it('sorts by popularity on request', async () => {
    const [me, author, fan] = [await t.user(), await t.user(), await t.user()];
    const { postId: quiet } = await postWith(author, 'image');
    const { postId: liked } = await postWith(author, 'image');
    const { postId: newest } = await postWith(author, 'image');
    await like(fan, quiet);
    await like(me, quiet);

    const latest = await allPages(me, 'pictures');
    expect(latest.indexOf(newest)).toBeLessThan(latest.indexOf(quiet));

    const popular = await allPages(me, 'pictures', { sort: 'popular' });
    expect(popular.indexOf(quiet)).toBeLessThan(popular.indexOf(newest));
    expect(popular).toContain(liked);

    const page = await feed(me, 'pictures', { limit: 1 }).expect(200);
    await feed(me, 'pictures', {
      sort: 'popular',
      cursor: page.body.meta.nextCursor,
    }).expect(400);
    await feed(me, 'pictures', { sort: 'random' }).expect(400);
  });
});
