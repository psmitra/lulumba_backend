import request from 'supertest';
import {
  FRONTEND_URL,
  startTestApp,
  type TestApp,
  type TestUser,
} from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_shares_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

const share = (u: TestUser, postId: string, body: Record<string, unknown>) =>
  request(t.http).post(`/posts/${postId}/shares`).set(as(u)).send(body);

const sharesCount = async (postId: string) =>
  (await request(t.http).get(`/posts/${postId}`).expect(200)).body.data
    .sharesCount as number;

describe('POST /posts/:postId/shares', () => {
  it('records shares and counts reach, not repeated taps', async () => {
    const owner = await t.user();
    const fan = await t.user();
    const friend = await t.user();
    const postId = await t.createPost(owner);

    const first = await share(fan, postId, { shareType: 'copy_link' }).expect(
      201,
    );
    expect(first.body.data).toEqual({
      shareId: expect.any(String),
      shareUrl: `${FRONTEND_URL}/posts/${postId}`,
      sharedAt: expect.any(String),
      sharesCount: 1,
    });
    await share(fan, postId, { shareType: 'copy_link' }).expect(201);
    await share(fan, postId, { shareType: 'copy_link' }).expect(201);
    expect(await sharesCount(postId)).toBe(1);

    await share(fan, postId, { shareType: 'external' }).expect(201);
    await share(fan, postId, {
      shareType: 'internal',
      recipientUserId: friend.id,
    }).expect(201);
    await share(fan, postId, {
      shareType: 'internal',
      recipientUserId: friend.id,
    }).expect(201);
    expect(await sharesCount(postId)).toBe(3);

    // Every action is still on record.
    expect(
      await t.connection
        .collection('shares')
        .countDocuments({ userId: fan.id }),
    ).toBe(6);
  });

  it('validates the share type and recipient', async () => {
    const owner = await t.user();
    const fan = await t.user();
    const postId = await t.createPost(owner);

    await share(fan, postId, { shareType: 'whatsapp' }).expect(400);
    await share(fan, postId, { shareType: 'internal' }).expect(400);
    await share(fan, postId, {
      shareType: 'copy_link',
      recipientUserId: owner.id,
    }).expect(400);
    await share(fan, postId, {
      shareType: 'internal',
      recipientUserId: fan.id,
    }).expect(400);
    await share(fan, postId, {
      shareType: 'internal',
      recipientUserId: 'no-such-user',
    }).expect(404);
    await request(t.http)
      .post(`/posts/${postId}/shares`)
      .send({ shareType: 'copy_link' })
      .expect(401);
  });

  it("won't share with blocked users or people who can't see the post", async () => {
    const owner = await t.user();
    const follower = await t.user();
    const outsider = await t.user();
    const blocked = await t.user();
    await request(t.http)
      .post(`/users/${owner.id}/follow`)
      .set(as(follower))
      .expect(200);
    const followersOnly = await t.createPost(owner, 'followers');
    const open = await t.createPost(owner);

    await share(follower, followersOnly, {
      shareType: 'internal',
      recipientUserId: outsider.id,
    }).expect(403);
    await share(follower, followersOnly, {
      shareType: 'internal',
      recipientUserId: owner.id,
    }).expect(201);
    await share(outsider, followersOnly, { shareType: 'copy_link' }).expect(
      404,
    );

    await t.connection.collection('blocks').insertOne({
      blockerId: blocked.id,
      blockedId: follower.id,
      createdAt: new Date(),
    });
    await share(follower, open, {
      shareType: 'internal',
      recipientUserId: blocked.id,
    }).expect(404);
  });
});

describe('GET /posts/:postId/share-link', () => {
  it('gives the canonical URL only to people who may see the post', async () => {
    const owner = await t.user();
    const stranger = await t.user();
    const open = await t.createPost(owner);
    const followersOnly = await t.createPost(owner, 'followers');

    const link = await request(t.http)
      .get(`/posts/${open}/share-link`)
      .expect(200);
    expect(link.body.data).toEqual({
      shareUrl: `${FRONTEND_URL}/posts/${open}`,
      visibility: 'public',
    });

    await request(t.http).get(`/posts/${followersOnly}/share-link`).expect(404);
    await request(t.http)
      .get(`/posts/${followersOnly}/share-link`)
      .set(as(stranger))
      .expect(404);
    const own = await request(t.http)
      .get(`/posts/${followersOnly}/share-link`)
      .set(as(owner))
      .expect(200);
    expect(own.body.data.visibility).toBe('followers');

    // The link grants nothing by itself: the post stays followers-only.
    await request(t.http)
      .get(`/posts/${followersOnly}`)
      .set(as(stranger))
      .expect(403);
  });
});
