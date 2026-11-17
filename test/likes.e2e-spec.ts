import request from 'supertest';
import { startTestApp, type TestApp } from './utils/test-app.js';

let t: TestApp;
let mediaCount = 0;

beforeAll(async () => {
  t = await startTestApp('lulumba_likes_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function user() {
  const ghanaWorksUser = t.newUser();
  return {
    id: String(ghanaWorksUser.id),
    name: ghanaWorksUser.name,
    token: await t.signIn(ghanaWorksUser),
  };
}

async function post(
  owner: { id: string; token: string },
  visibility = 'public',
): Promise<string> {
  mediaCount += 1;
  const { insertedId } = await t.connection.collection('media').insertOne({
    ownerId: owner.id,
    mediaType: 'image',
    status: 'ready',
    variant: 'original',
    fileName: 'p.webp',
    mimeType: 'image/webp',
    size: 100,
    storageProvider: 'ftp',
    storageKey: `posts/images/likes-${mediaCount}.webp`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const res = await request(t.http)
    .post('/api/v1/posts')
    .set(as(owner.token))
    .send({
      visibility,
      attachments: [{ mediaId: insertedId.toString(), sortOrder: 0 }],
    })
    .expect(201);
  return res.body.data.id as string;
}

describe('PUT / DELETE /posts/:postId/like', () => {
  it('likes once, counts once, and unlikes idempotently', async () => {
    const owner = await user();
    const fan = await user();
    const id = await post(owner);
    const like = () =>
      request(t.http).put(`/api/v1/posts/${id}/like`).set(as(fan.token));
    const unlike = () =>
      request(t.http).delete(`/api/v1/posts/${id}/like`).set(as(fan.token));

    expect((await like().expect(200)).body.data).toEqual({
      liked: true,
      likesCount: 1,
    });
    expect((await like().expect(200)).body.data).toEqual({
      liked: true,
      likesCount: 1,
    });
    await request(t.http)
      .put(`/api/v1/posts/${id}/like`)
      .set(as(owner.token))
      .expect(200);

    const seen = await request(t.http)
      .get(`/api/v1/posts/${id}`)
      .set(as(fan.token))
      .expect(200);
    expect(seen.body.data).toMatchObject({ likesCount: 2, isLiked: true });

    expect((await unlike().expect(200)).body.data).toEqual({
      liked: false,
      likesCount: 1,
    });
    expect((await unlike().expect(200)).body.data).toEqual({
      liked: false,
      likesCount: 1,
    });
  });

  it('keeps the count right under concurrent likes', async () => {
    const owner = await user();
    const fan = await user();
    const id = await post(owner);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(t.http)
          .put(`/api/v1/posts/${id}/like`)
          .set(as(fan.token))
          .expect(200),
      ),
    );
    const seen = await request(t.http).get(`/api/v1/posts/${id}`).expect(200);
    expect(seen.body.data.likesCount).toBe(1);
  });

  it("can't like posts you can't see", async () => {
    const owner = await user();
    const stranger = await user();
    const hidden = await post(owner, 'followers');
    await request(t.http)
      .put(`/api/v1/posts/${hidden}/like`)
      .set(as(stranger.token))
      .expect(404);
    await request(t.http)
      .put('/api/v1/posts/0123456789abcdef01234567/like')
      .set(as(stranger.token))
      .expect(404);
    await request(t.http)
      .put('/api/v1/posts/bad-id/like')
      .set(as(stranger.token))
      .expect(400);
    await request(t.http).put(`/api/v1/posts/${hidden}/like`).expect(401);
  });
});

describe('GET /posts/:postId/likes', () => {
  it('lists likers newest first with cursor paging', async () => {
    const owner = await user();
    const likers = [await user(), await user(), await user()];
    const id = await post(owner);
    for (const liker of likers) {
      await request(t.http)
        .put(`/api/v1/posts/${id}/like`)
        .set(as(liker.token))
        .expect(200);
    }
    await request(t.http)
      .post(`/api/v1/users/${likers[0]!.id}/follow`)
      .set(as(owner.token))
      .expect(200);

    const page1 = await request(t.http)
      .get(`/api/v1/posts/${id}/likes`)
      .set(as(owner.token))
      .query({ limit: 2 })
      .expect(200);
    expect(
      page1.body.data.map((l: { user: { userId: string } }) => l.user.userId),
    ).toEqual([likers[2]!.id, likers[1]!.id]);
    expect(page1.body.data[0]).toMatchObject({
      user: { displayName: likers[2]!.name },
      isFollowing: false,
      isMe: false,
    });

    const page2 = await request(t.http)
      .get(`/api/v1/posts/${id}/likes`)
      .set(as(owner.token))
      .query({ limit: 2, cursor: page1.body.meta.nextCursor })
      .expect(200);
    expect(page2.body.data).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ userId: likers[0]!.id }),
        isFollowing: true,
      }),
    ]);
    expect(page2.body.meta).toMatchObject({ hasMore: false, nextCursor: null });

    // Public post: readable signed out.
    await request(t.http).get(`/api/v1/posts/${id}/likes`).expect(200);
  });

  it('respects post visibility and blocks', async () => {
    const owner = await user();
    const follower = await user();
    const blocked = await user();
    const viewer = await user();
    await request(t.http)
      .post(`/api/v1/users/${owner.id}/follow`)
      .set(as(follower.token))
      .expect(200);
    const followersOnly = await post(owner, 'followers');
    await request(t.http)
      .put(`/api/v1/posts/${followersOnly}/like`)
      .set(as(follower.token))
      .expect(200);

    await request(t.http)
      .get(`/api/v1/posts/${followersOnly}/likes`)
      .expect(404);
    await request(t.http)
      .get(`/api/v1/posts/${followersOnly}/likes`)
      .set(as(viewer.token))
      .expect(404);
    await request(t.http)
      .get(`/api/v1/posts/${followersOnly}/likes`)
      .set(as(follower.token))
      .expect(200);

    // A liker blocked by the viewer is left out of the list.
    const open = await post(owner);
    await request(t.http)
      .put(`/api/v1/posts/${open}/like`)
      .set(as(blocked.token))
      .expect(200);
    await request(t.http)
      .put(`/api/v1/posts/${open}/like`)
      .set(as(follower.token))
      .expect(200);
    await t.connection.collection('blocks').insertOne({
      blockerId: viewer.id,
      blockedId: blocked.id,
      createdAt: new Date(),
    });
    const list = await request(t.http)
      .get(`/api/v1/posts/${open}/likes`)
      .set(as(viewer.token))
      .expect(200);
    expect(
      list.body.data.map((l: { user: { userId: string } }) => l.user.userId),
    ).toEqual([follower.id]);
  });
});
