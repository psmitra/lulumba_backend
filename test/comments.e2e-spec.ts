import request from 'supertest';
import { startTestApp, type TestApp, type TestUser } from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_comments_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

const comment = (u: TestUser, postId: string, body: string) =>
  request(t.http).post(`/posts/${postId}/comments`).set(as(u)).send({ body });

const reply = (u: TestUser, commentId: string, body: string) =>
  request(t.http)
    .post(`/comments/${commentId}/replies`)
    .set(as(u))
    .send({ body });

const counts = async (postId: string) =>
  (await request(t.http).get(`/posts/${postId}`).expect(200)).body.data
    .commentsCount as number;

describe('comments', () => {
  it('creates, lists (both orders, paged), edits and counts comments', async () => {
    const owner = await t.user();
    const fan = await t.user();
    const postId = await t.createPost(owner);

    const first = await comment(fan, postId, '  Beautiful work!  ').expect(201);
    expect(first.body.data).toMatchObject({
      postId,
      user: { userId: fan.id, displayName: fan.name },
      body: 'Beautiful work!',
      repliesCount: 0,
      isDeleted: false,
      isEdited: false,
      isMine: true,
    });
    await comment(owner, postId, 'Thank you').expect(201);
    await comment(fan, postId, 'How much?').expect(201);
    expect(await counts(postId)).toBe(3);

    const bodies = (res: request.Response) =>
      res.body.data.map((c: { body: string }) => c.body);
    const oldest = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .query({ limit: 2 })
      .expect(200);
    expect(bodies(oldest)).toEqual(['Beautiful work!', 'Thank you']);
    const rest = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .query({ limit: 2, cursor: oldest.body.meta.nextCursor })
      .expect(200);
    expect(bodies(rest)).toEqual(['How much?']);
    const newest = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .query({ sort: 'newest' })
      .expect(200);
    expect(bodies(newest)).toEqual([
      'How much?',
      'Thank you',
      'Beautiful work!',
    ]);

    const id = first.body.data.id as string;
    const edited = await request(t.http)
      .patch(`/comments/${id}`)
      .set(as(fan))
      .send({ body: 'Beautiful work, really!' })
      .expect(200);
    expect(edited.body.data).toMatchObject({
      body: 'Beautiful work, really!',
      isEdited: true,
    });
    await request(t.http)
      .patch(`/comments/${id}`)
      .set(as(owner))
      .send({ body: 'hacked' })
      .expect(403);
  });

  it('validates body length and post access', async () => {
    const owner = await t.user();
    const stranger = await t.user();
    const postId = await t.createPost(owner);
    const followersOnly = await t.createPost(owner, 'followers');

    await comment(stranger, postId, '   ').expect(400);
    await comment(stranger, postId, 'x'.repeat(2001)).expect(400);
    await comment(stranger, followersOnly, 'hi').expect(404);
    await request(t.http).get(`/posts/${followersOnly}/comments`).expect(404);
    await request(t.http)
      .post(`/posts/${postId}/comments`)
      .send({ body: 'hi' })
      .expect(401);

    await t.connection.collection('blocks').insertOne({
      blockerId: owner.id,
      blockedId: stranger.id,
      createdAt: new Date(),
    });
    await comment(stranger, postId, 'hi').expect(404);
  });

  it('hides comments from users blocked by the viewer', async () => {
    const owner = await t.user();
    const troll = await t.user();
    const viewer = await t.user();
    const postId = await t.createPost(owner);
    await comment(troll, postId, 'spam').expect(201);
    await comment(owner, postId, 'hello').expect(201);
    await t.connection.collection('blocks').insertOne({
      blockerId: viewer.id,
      blockedId: troll.id,
      createdAt: new Date(),
    });
    const list = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .set(as(viewer))
      .expect(200);
    expect(list.body.data.map((c: { body: string }) => c.body)).toEqual([
      'hello',
    ]);
  });
});

describe('replies', () => {
  it('replies one level deep, in chronological order, with counts', async () => {
    const owner = await t.user();
    const fan = await t.user();
    const postId = await t.createPost(owner);
    const parent = (await comment(fan, postId, 'Price?').expect(201)).body.data
      .id;

    const r1 = await reply(owner, parent, 'GHS 2,500').expect(201);
    expect(r1.body.data).toMatchObject({
      commentId: parent,
      postId,
      user: { userId: owner.id },
      body: 'GHS 2,500',
    });
    await reply(fan, parent, 'Deal!').expect(201);
    // No replies to replies.
    await reply(fan, r1.body.data.id, 'nested').expect(400);

    const list = await request(t.http)
      .get(`/comments/${parent}/replies`)
      .query({ limit: 1 })
      .expect(200);
    expect(list.body.data.map((r: { body: string }) => r.body)).toEqual([
      'GHS 2,500',
    ]);
    expect(list.body.meta.hasMore).toBe(true);

    const comments = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .expect(200);
    expect(comments.body.data[0]).toMatchObject({ repliesCount: 2 });
    // Replies are not inline, but count towards the post.
    expect(comments.body.data[0].replies).toBeUndefined();
    expect(await counts(postId)).toBe(3);

    const replyId = r1.body.data.id as string;
    await request(t.http)
      .patch(`/replies/${replyId}`)
      .set(as(owner))
      .send({ body: 'GHS 2,400' })
      .expect(200);
    await request(t.http)
      .patch(`/replies/${replyId}`)
      .set(as(fan))
      .send({ body: 'x' })
      .expect(403);
    // A reply id is not a comment, and the other way round.
    await request(t.http)
      .patch(`/comments/${replyId}`)
      .set(as(owner))
      .send({ body: 'x' })
      .expect(404);
    await request(t.http).delete(`/replies/${parent}`).set(as(fan)).expect(404);

    await request(t.http)
      .delete(`/replies/${replyId}`)
      .set(as(fan))
      .expect(403);
    await request(t.http)
      .delete(`/replies/${replyId}`)
      .set(as(owner))
      .expect(200, {
        success: true,
        message: 'Reply deleted',
        data: { deleted: true },
        meta: null,
      });
    await request(t.http)
      .delete(`/replies/${replyId}`)
      .set(as(owner))
      .expect(404);
    expect(await counts(postId)).toBe(2);
  });

  it("can't reply to someone you blocked", async () => {
    const owner = await t.user();
    const a = await t.user();
    const b = await t.user();
    const postId = await t.createPost(owner);
    const parent = (await comment(a, postId, 'hi').expect(201)).body.data.id;
    await t.connection.collection('blocks').insertOne({
      blockerId: a.id,
      blockedId: b.id,
      createdAt: new Date(),
    });
    await reply(b, parent, 'hey').expect(403);
  });
});

describe('deleting a comment', () => {
  it('keeps its replies under a "[deleted]" marker; drops it when empty', async () => {
    const owner = await t.user();
    const fan = await t.user();
    const postId = await t.createPost(owner);
    const withReplies = (await comment(fan, postId, 'Question').expect(201))
      .body.data.id;
    const alone = (await comment(fan, postId, 'Nice').expect(201)).body.data.id;
    const answer = (await reply(owner, withReplies, 'Answer').expect(201)).body
      .data.id;
    expect(await counts(postId)).toBe(3);

    await request(t.http)
      .delete(`/comments/${withReplies}`)
      .set(as(owner))
      .expect(403);
    await request(t.http)
      .delete(`/comments/${withReplies}`)
      .set(as(fan))
      .expect(200);
    await request(t.http).delete(`/comments/${alone}`).set(as(fan)).expect(200);
    expect(await counts(postId)).toBe(1);

    const list = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: withReplies,
        isDeleted: true,
        user: null,
        body: null,
        repliesCount: 1,
        isMine: false,
      }),
    ]);
    const replies = await request(t.http)
      .get(`/comments/${withReplies}/replies`)
      .expect(200);
    expect(replies.body.data.map((r: { id: string }) => r.id)).toEqual([
      answer,
    ]);

    // Deleted comments can't get new replies or edits.
    await reply(owner, withReplies, 'late').expect(404);
    await request(t.http)
      .patch(`/comments/${withReplies}`)
      .set(as(fan))
      .send({ body: 'x' })
      .expect(404);

    // Once its last reply goes, the marker goes too.
    await request(t.http)
      .delete(`/replies/${answer}`)
      .set(as(owner))
      .expect(200);
    const empty = await request(t.http)
      .get(`/posts/${postId}/comments`)
      .expect(200);
    expect(empty.body.data).toEqual([]);
    await request(t.http).get(`/comments/${withReplies}/replies`).expect(404);
    expect(await counts(postId)).toBe(0);
  });
});
