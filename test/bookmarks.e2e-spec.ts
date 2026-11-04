import request from 'supertest';
import { startTestApp, type TestApp, type TestUser } from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_bookmarks_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const save = (u: TestUser, postId: string) =>
  request(t.http).put(`/posts/${postId}/bookmark`).set(as(u));
const unsave = (u: TestUser, postId: string) =>
  request(t.http).delete(`/posts/${postId}/bookmark`).set(as(u));
const shortlist = (u: TestUser, query: Record<string, string | number> = {}) =>
  request(t.http)
    .get('/users/me/bookmarks')
    .set(as(u))
    .query(query)
    .expect(200);
const ids = (res: request.Response) =>
  res.body.data.map((item: { post: { id: string } }) => item.post.id);

/** Turns a post's only attachment into a document. */
async function makeDocumentPost(postId: string) {
  const { Types } = await import('mongoose');
  await t.connection
    .collection('posts')
    .updateOne(
      { _id: new Types.ObjectId(postId) },
      {
        $set: {
          mediaTypes: ['document'],
          'attachments.0.mediaType': 'document',
        },
      },
    );
}

describe('PUT / DELETE /posts/:postId/bookmark', () => {
  it('saves once and removes idempotently', async () => {
    const owner = await t.user();
    const me = await t.user();
    const postId = await t.createPost(owner);

    await save(me, postId).expect(200, {
      success: true,
      message: 'Saved',
      data: { saved: true },
      meta: null,
    });
    await save(me, postId).expect(200);
    expect(
      await t.connection
        .collection('bookmarks')
        .countDocuments({ userId: me.id }),
    ).toBe(1);

    const seen = await request(t.http)
      .get(`/posts/${postId}`)
      .set(as(me))
      .expect(200);
    expect(seen.body.data.isSaved).toBe(true);

    for (let i = 0; i < 2; i++) {
      const res = await unsave(me, postId).expect(200);
      expect(res.body.data).toEqual({ saved: false });
    }
    expect(ids(await shortlist(me))).toEqual([]);
  });

  it("can't save posts you can't see", async () => {
    const owner = await t.user();
    const me = await t.user();
    const followersOnly = await t.createPost(owner, 'followers');
    await save(me, followersOnly).expect(404);
    await save(me, '0123456789abcdef01234567').expect(404);
    await save(me, 'nope').expect(400);
    await request(t.http).put(`/posts/${followersOnly}/bookmark`).expect(401);
  });
});

describe('GET /users/me/bookmarks', () => {
  it('lists only your saves, newest first, paged and filtered by type', async () => {
    const owner = await t.user();
    const me = await t.user();
    const someoneElse = await t.user();
    const [a, b, c] = [
      await t.createPost(owner),
      await t.createPost(owner),
      await t.createPost(owner),
    ];
    await makeDocumentPost(b);
    for (const postId of [a, b, c]) await save(me, postId).expect(200);
    await save(someoneElse, a).expect(200);

    const page1 = await shortlist(me, { limit: 2 });
    expect(ids(page1)).toEqual([c, b]);
    expect(page1.body.data[0]).toMatchObject({
      post: { id: c, isSaved: true, author: { userId: owner.id } },
      savedAt: expect.any(String),
    });
    const page2 = await shortlist(me, {
      limit: 2,
      cursor: page1.body.meta.nextCursor,
    });
    expect(ids(page2)).toEqual([a]);
    expect(page2.body.meta.hasMore).toBe(false);

    expect(ids(await shortlist(me, { type: 'document' }))).toEqual([b]);
    // The join runs before the limit, so a filtered page is still full.
    const photos = await shortlist(me, { type: 'photo', limit: 2 });
    expect(ids(photos)).toEqual([c, a]);
    expect(ids(await shortlist(someoneElse))).toEqual([a]);
  });

  it('omits deleted and no-longer-visible posts', async () => {
    const owner = await t.user();
    const me = await t.user();
    await request(t.http)
      .post(`/users/${owner.id}/follow`)
      .set(as(me))
      .expect(200);
    const deleted = await t.createPost(owner);
    const followersOnly = await t.createPost(owner, 'followers');
    const kept = await t.createPost(owner);
    for (const postId of [deleted, followersOnly, kept]) {
      await save(me, postId).expect(200);
    }
    expect(ids(await shortlist(me))).toEqual([kept, followersOnly, deleted]);

    await request(t.http)
      .delete(`/posts/${deleted}`)
      .set(as(owner))
      .expect(200);
    await request(t.http)
      .delete(`/users/${owner.id}/follow`)
      .set(as(me))
      .expect(204);
    expect(ids(await shortlist(me))).toEqual([kept]);

    // Still removable after the post went away.
    await unsave(me, deleted).expect(200);
  });
});
