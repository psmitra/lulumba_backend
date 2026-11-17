import { Types } from 'mongoose';
import request from 'supertest';
import { startTestApp, type TestApp } from './utils/test-app.js';

let t: TestApp;
let mediaCount = 0;

beforeAll(async () => {
  t = await startTestApp('lulumba_posts_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Inserts an uploaded file directly, as the (future) upload API would. */
async function insertMedia(
  ownerId: number,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  mediaCount += 1;
  const { insertedId } = await t.connection.collection('media').insertOne({
    ownerId: String(ownerId),
    mediaType: 'image',
    status: 'ready',
    variant: 'original',
    fileName: `photo-${mediaCount}.webp`,
    mimeType: 'image/webp',
    size: 1000,
    storageProvider: 'ftp',
    storageKey: `posts/images/photo-${mediaCount}.webp`,
    width: 1080,
    height: 1080,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return insertedId.toString();
}

async function author() {
  const user = t.newUser();
  return { user, token: await t.signIn(user) };
}

function createPost(token: string, body: Record<string, unknown>) {
  return request(t.http).post('/api/v1/posts').set(as(token)).send(body);
}

describe('POST /posts', () => {
  it('creates a post with ordered attachments and its author', async () => {
    const { user, token } = await author();
    const first = await insertMedia(user.id);
    const second = await insertMedia(user.id, {
      mediaType: 'video',
      mimeType: 'video/mp4',
      storageKey: `posts/videos/clip-${mediaCount}.mp4`,
      durationSeconds: 12,
    });

    const res = await createPost(token, {
      caption: '  New table, solid mahogany  ',
      visibility: 'public',
      attachments: [
        { mediaId: second, sortOrder: 5 },
        { mediaId: first, sortOrder: 1 },
      ],
    }).expect(201);

    expect(res.body.data).toMatchObject({
      author: { userId: String(user.id), displayName: user.name },
      caption: 'New table, solid mahogany',
      visibility: 'public',
      likesCount: 0,
      isLiked: false,
      isMine: true,
    });
    expect(res.body.data.attachments).toEqual([
      expect.objectContaining({
        mediaId: first,
        sortOrder: 0,
        mediaType: 'image',
        url: expect.stringContaining('https://cdn.example.test/media/posts/'),
      }),
      expect.objectContaining({
        mediaId: second,
        sortOrder: 1,
        durationSeconds: 12,
      }),
    ]);
  });

  it("rejects media that isn't yours, isn't ready or is already used", async () => {
    const { user, token } = await author();
    const other = await author();
    const notMine = await insertMedia(other.user.id);
    const pending = await insertMedia(user.id, { status: 'processing' });
    const used = await insertMedia(user.id);
    await createPost(token, {
      visibility: 'public',
      attachments: [{ mediaId: used, sortOrder: 0 }],
    }).expect(201);

    for (const mediaId of [notMine, pending]) {
      await createPost(token, {
        visibility: 'public',
        attachments: [{ mediaId, sortOrder: 0 }],
      }).expect(400);
    }
    await createPost(token, {
      visibility: 'public',
      attachments: [{ mediaId: used, sortOrder: 0 }],
    }).expect(409);
  });

  it('validates the body', async () => {
    const { token } = await author();
    await createPost(token, { visibility: 'public', attachments: [] }).expect(
      400,
    );
    await createPost(token, {
      visibility: 'everyone',
      attachments: [{ mediaId: new Types.ObjectId().toString(), sortOrder: 0 }],
    }).expect(400);
    await request(t.http).post('/api/v1/posts').send({}).expect(401);
  });

  it('returns the same post when retried with an idempotency key', async () => {
    const { user, token } = await author();
    const mediaId = await insertMedia(user.id);
    const body = {
      visibility: 'public',
      attachments: [{ mediaId, sortOrder: 0 }],
      idempotencyKey: 'retry-key-0001',
    };
    const first = await createPost(token, body).expect(201);
    const retry = await createPost(token, body).expect(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
  });
});

describe('GET /posts/:postId', () => {
  it('applies visibility, block and delete rules', async () => {
    const owner = await author();
    const follower = await author();
    const stranger = await author();
    const ownerUrl = `/api/v1/users/${owner.user.id}`;
    await request(t.http)
      .post(`${ownerUrl}/follow`)
      .set(as(follower.token))
      .expect(200);

    const publicPost = await createPost(owner.token, {
      visibility: 'public',
      attachments: [
        { mediaId: await insertMedia(owner.user.id), sortOrder: 0 },
      ],
    });
    const followersPost = await createPost(owner.token, {
      visibility: 'followers',
      attachments: [
        { mediaId: await insertMedia(owner.user.id), sortOrder: 0 },
      ],
    });
    const publicUrl = `/api/v1/posts/${publicPost.body.data.id}`;
    const followersUrl = `/api/v1/posts/${followersPost.body.data.id}`;

    await request(t.http).get(publicUrl).expect(200);
    await request(t.http).get(followersUrl).expect(401);
    await request(t.http).get(followersUrl).set(as(stranger.token)).expect(403);
    await request(t.http).get(followersUrl).set(as(follower.token)).expect(200);

    await t.connection.collection('blocks').insertOne({
      blockerId: String(owner.user.id),
      blockedId: String(stranger.user.id),
      createdAt: new Date(),
    });
    await request(t.http).get(publicUrl).set(as(stranger.token)).expect(404);

    await request(t.http)
      .delete(publicUrl)
      .set(as(owner.token))
      .expect(200, {
        success: true,
        message: 'Post deleted',
        data: { deleted: true },
        meta: null,
      });
    await request(t.http).get(publicUrl).expect(404);
    await request(t.http).get('/api/v1/posts/not-an-id').expect(400);
  });
});

describe('PATCH and DELETE /posts/:postId', () => {
  it('lets only the author edit, reorder and remove attachments', async () => {
    const owner = await author();
    const other = await author();
    const [a, b, c] = [
      await insertMedia(owner.user.id),
      await insertMedia(owner.user.id),
      await insertMedia(owner.user.id),
    ];
    const created = await createPost(owner.token, {
      caption: 'Before',
      visibility: 'public',
      attachments: [
        { mediaId: a, sortOrder: 0 },
        { mediaId: b, sortOrder: 1 },
        { mediaId: c, sortOrder: 2 },
      ],
    });
    const url = `/api/v1/posts/${created.body.data.id}`;

    const res = await request(t.http)
      .patch(url)
      .set(as(owner.token))
      .send({
        caption: 'After',
        visibility: 'followers',
        attachments: [
          { mediaId: c, sortOrder: 0 },
          { mediaId: a, sortOrder: 1 },
        ],
      })
      .expect(200);
    expect(res.body.data).toMatchObject({
      caption: 'After',
      visibility: 'followers',
    });
    expect(
      res.body.data.attachments.map((x: { mediaId: string }) => x.mediaId),
    ).toEqual([c, a]);

    // Swapping in other media (even your own) is not an edit.
    await request(t.http)
      .patch(url)
      .set(as(owner.token))
      .send({
        attachments: [
          { mediaId: await insertMedia(owner.user.id), sortOrder: 0 },
        ],
      })
      .expect(400);

    await request(t.http)
      .patch(url)
      .set(as(other.token))
      .send({ caption: 'x' })
      .expect(403);
    await request(t.http).delete(url).set(as(other.token)).expect(403);
  });
});

describe('GET /posts', () => {
  it('pages with a cursor and filters by type and user', async () => {
    const owner = await author();
    const viewer = await author();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await createPost(owner.token, {
        visibility: 'public',
        attachments: [
          { mediaId: await insertMedia(owner.user.id), sortOrder: 0 },
        ],
      });
      ids.unshift(res.body.data.id);
    }
    await createPost(owner.token, {
      visibility: 'public',
      attachments: [
        {
          mediaId: await insertMedia(owner.user.id, {
            mediaType: 'document',
            mimeType: 'application/pdf',
            storageKey: `posts/documents/cv-${mediaCount}.pdf`,
          }),
          sortOrder: 0,
        },
      ],
    });

    const list = (query: Record<string, string | number>) =>
      request(t.http)
        .get('/api/v1/posts')
        .set(as(viewer.token))
        .query(query)
        .expect(200);

    const page1 = await list({
      userId: String(owner.user.id),
      type: 'photo',
      limit: 3,
    });
    expect(page1.body.data.map((p: { id: string }) => p.id)).toEqual(
      ids.slice(0, 3),
    );
    expect(page1.body.meta).toMatchObject({ limit: 3, hasMore: true });

    const page2 = await list({
      userId: String(owner.user.id),
      type: 'photo',
      limit: 3,
      cursor: page1.body.meta.nextCursor,
    });
    expect(page2.body.data.map((p: { id: string }) => p.id)).toEqual(
      ids.slice(3),
    );
    expect(page2.body.meta).toMatchObject({ hasMore: false, nextCursor: null });

    const documents = await list({
      userId: String(owner.user.id),
      type: 'document',
    });
    expect(documents.body.data).toHaveLength(1);

    await request(t.http)
      .get('/api/v1/posts')
      .set(as(viewer.token))
      .query({ cursor: 'garbage' })
      .expect(400);
  });

  it('hides followers-only posts unless you follow the author', async () => {
    const owner = await author();
    const viewer = await author();
    await createPost(owner.token, {
      visibility: 'followers',
      attachments: [
        { mediaId: await insertMedia(owner.user.id), sortOrder: 0 },
      ],
    });
    const userPosts = () =>
      request(t.http)
        .get('/api/v1/posts')
        .set(as(viewer.token))
        .query({ userId: String(owner.user.id) })
        .expect(200);

    expect((await userPosts()).body.data).toHaveLength(0);
    await request(t.http)
      .post(`/api/v1/users/${owner.user.id}/follow`)
      .set(as(viewer.token))
      .expect(200);
    expect((await userPosts()).body.data).toHaveLength(1);
  });
});
