import request from 'supertest';
import { startTestApp, type TestApp } from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_media_e2e');
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

// Smallest byte sequences file-type recognises, padded to `size`.
const PNG_HEADER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
const MP4_HEADER = Buffer.from(
  '0000001866747970697336d6f6d0000020069736f6d69736f32',
  'hex',
);
const hex = (value: string) => Buffer.from(value.replace(/\s/g, ''), 'hex');
/** Minimal header of every accepted image format, by its usual extension. */
const IMAGE_HEADERS: Record<string, { header: Buffer; mime: string }> = {
  jpg: { header: hex('ffd8ffe000104a464946000101'), mime: 'image/jpeg' },
  png: { header: PNG_HEADER, mime: 'image/png' },
  apng: {
    // PNG + IHDR + acTL (animation control) chunk.
    header: Buffer.concat([
      PNG_HEADER,
      hex('00000008 6163544c 00000001 00000000 b42de381'),
    ]),
    mime: 'image/apng',
  },
  gif: {
    header: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'latin1'),
    mime: 'image/gif',
  },
  webp: {
    header: Buffer.concat([
      Buffer.from('RIFF'),
      hex('00100000'),
      Buffer.from('WEBPVP8 '),
    ]),
    mime: 'image/webp',
  },
  avif: {
    header: hex('0000001c 66747970 61766966 00000000 61766966 6d696631'),
    mime: 'image/avif',
  },
  heic: {
    header: hex('00000018 66747970 68656963 00000000 6d696631 68656963'),
    mime: 'image/heic',
  },
  heif: {
    // iPhone photo with the generic `mif1` brand: still named .heic.
    header: hex('00000018 66747970 6d696631 00000000 6d696631 68656963'),
    mime: 'image/heif',
  },
  jxl: { header: hex('ff0a'), mime: 'image/jxl' },
  bmp: {
    header: Buffer.concat([
      Buffer.from('BM'),
      hex('3a000000 00000000 36000000 28000000'),
    ]),
    mime: 'image/bmp',
  },
  tiff: { header: hex('49492a00 08000000'), mime: 'image/tiff' },
};
const pad = (header: Buffer, size = 2048) =>
  Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length))]);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function user() {
  const ghanaWorksUser = t.newUser();
  return {
    id: String(ghanaWorksUser.id),
    token: await t.signIn(ghanaWorksUser),
  };
}

function upload(
  token: string,
  file: Buffer,
  fileName: string,
  mediaType: string,
  fields: Record<string, string> = {},
) {
  const req = request(t.http)
    .post('/api/v1/media/uploads')
    .set(as(token))
    .field('mediaType', mediaType);
  for (const [key, value] of Object.entries(fields)) req.field(key, value);
  return req.attach('file', file, fileName);
}

describe('POST /media/uploads', () => {
  it('stores a valid image and returns its metadata', async () => {
    const owner = await user();
    const res = await upload(
      owner.token,
      pad(PNG_HEADER),
      'Table photo.PNG',
      'image',
      {
        width: '1080',
        height: '720',
      },
    ).expect(201);

    expect(res.body.data).toMatchObject({
      mediaType: 'image',
      fileName: 'Table photo.PNG',
      mimeType: 'image/png',
      size: 2048,
      status: 'ready',
      width: 1080,
      height: 720,
      isMine: true,
      fileUrl: expect.stringMatching(
        /^https:\/\/cdn\.example\.test\/media\/posts\/images\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/,
      ),
    });
    const key = res.body.data.fileUrl.replace(
      'https://cdn.example.test/media/',
      '',
    );
    expect(t.storage.files.has(key)).toBe(true);
  });

  it('accepts documents and videos by their content', async () => {
    const owner = await user();
    await upload(owner.token, pad(PDF_HEADER), 'cv.pdf', 'document').expect(
      201,
    );
    const video = await upload(
      owner.token,
      pad(MP4_HEADER),
      'clip.mp4',
      'video',
      {
        durationSeconds: '12',
      },
    ).expect(201);
    expect(video.body.data).toMatchObject({
      mimeType: 'video/mp4',
      durationSeconds: 12,
    });
  });

  it.each(Object.entries(IMAGE_HEADERS))(
    'accepts %s images',
    async (extension, { header, mime }) => {
      const owner = await user();
      const name = extension === 'heif' ? 'IMG_0001.HEIC' : `a.${extension}`;
      const res = await upload(owner.token, pad(header), name, 'image').expect(
        201,
      );
      expect(res.body.data).toMatchObject({ mimeType: mime, fileName: name });
    },
  );

  it('accepts an image whose name has another image extension', async () => {
    const owner = await user();
    // Downloaded JPEGs are often saved as .png: stored under the real type.
    const res = await upload(
      owner.token,
      pad(IMAGE_HEADERS.jpg!.header),
      'Aquarium Air Pump Combo Kit(1).png',
      'image',
    ).expect(201);
    expect(res.body.data).toMatchObject({
      mimeType: 'image/jpeg',
      fileName: 'Aquarium Air Pump Combo Kit(1).png',
      fileUrl: expect.stringMatching(/\.jpg$/),
    });
  });

  it('rejects SVG, which can carry scripts', async () => {
    const owner = await user();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const res = await upload(owner.token, svg, 'logo.svg', 'image').expect(415);
    expect(res.body.message).toContain('Supported: jpg');
  });

  it('never trusts the declared type, extension or content type', async () => {
    const owner = await user();
    // A PNG declared as a video.
    await upload(owner.token, pad(PNG_HEADER), 'photo.png', 'video').expect(
      415,
    );
    // A PNG named like a PDF.
    await upload(owner.token, pad(PNG_HEADER), 'photo.pdf', 'image').expect(
      415,
    );
    // Plain text with an image name and content type.
    await request(t.http)
      .post('/api/v1/media/uploads')
      .set(as(owner.token))
      .field('mediaType', 'image')
      .attach('file', Buffer.from('hello'), {
        filename: 'evil.png',
        contentType: 'image/png',
      })
      .expect(415);
    expect(t.storage.files.size).toBeGreaterThan(0);
  });

  it('validates the request', async () => {
    const owner = await user();
    await request(t.http)
      .post('/api/v1/media/uploads')
      .set(as(owner.token))
      .field('mediaType', 'image')
      .expect(400);
    await upload(owner.token, pad(PNG_HEADER), 'photo.png', 'sticker').expect(
      400,
    );
    await upload(owner.token, pad(PNG_HEADER), 'noextension', 'image').expect(
      400,
    );
    await request(t.http)
      .post('/api/v1/media/uploads')
      .attach('file', pad(PNG_HEADER), 'photo.png')
      .expect(401);
  });

  it('enforces the per-user quota (1 MB in tests)', async () => {
    const owner = await user();
    const big = pad(PNG_HEADER, 600 * 1024);
    await upload(owner.token, big, 'one.png', 'image').expect(201);
    await upload(owner.token, big, 'two.png', 'image').expect(413);
  });

  it('answers 503 without provider details when storage is down', async () => {
    const owner = await user();
    t.storage.failing = true;
    try {
      const res = await upload(
        owner.token,
        pad(PNG_HEADER),
        'photo.png',
        'image',
      ).expect(503);
      expect(JSON.stringify(res.body)).not.toContain('Login incorrect');
    } finally {
      t.storage.failing = false;
    }
  });
});

describe('GET /media/:mediaId and /status', () => {
  it('shows media to its owner, and to others only through a visible post', async () => {
    const owner = await user();
    const stranger = await user();
    const uploaded = await upload(
      owner.token,
      pad(PNG_HEADER),
      'a.png',
      'image',
    );
    const url = `/api/v1/media/${uploaded.body.data.id}`;

    await request(t.http).get(url).set(as(owner.token)).expect(200);
    await request(t.http)
      .get(`${url}/status`)
      .set(as(owner.token))
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toEqual({ status: 'ready', failureReason: null }),
      );
    await request(t.http).get(url).set(as(stranger.token)).expect(404);

    await request(t.http)
      .post('/api/v1/posts')
      .set(as(owner.token))
      .send({
        visibility: 'public',
        attachments: [{ mediaId: uploaded.body.data.id, sortOrder: 0 }],
      })
      .expect(201);
    const seen = await request(t.http)
      .get(url)
      .set(as(stranger.token))
      .expect(200);
    expect(seen.body.data.isMine).toBe(false);
    await request(t.http)
      .get('/api/v1/media/nope')
      .set(as(owner.token))
      .expect(400);
  });
});

describe('DELETE /media/:mediaId', () => {
  it('deletes unattached media and its file; refuses while a post uses it', async () => {
    const owner = await user();
    const other = await user();
    const attached = await upload(
      owner.token,
      pad(PNG_HEADER),
      'a.png',
      'image',
    );
    const loose = await upload(owner.token, pad(PNG_HEADER), 'b.png', 'image');
    await request(t.http)
      .post('/api/v1/posts')
      .set(as(owner.token))
      .send({
        visibility: 'public',
        attachments: [{ mediaId: attached.body.data.id, sortOrder: 0 }],
      })
      .expect(201);

    await request(t.http)
      .delete(`/api/v1/media/${attached.body.data.id}`)
      .set(as(owner.token))
      .expect(409);
    await request(t.http)
      .delete(`/api/v1/media/${attached.body.data.id}`)
      .set(as(other.token))
      .expect(403);
    await request(t.http)
      .delete(`/api/v1/media/${loose.body.data.id}`)
      .set(as(other.token))
      .expect(404);

    const key = loose.body.data.fileUrl.replace(
      'https://cdn.example.test/media/',
      '',
    );
    await request(t.http)
      .delete(`/api/v1/media/${loose.body.data.id}`)
      .set(as(owner.token))
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ deleted: true }));
    expect(t.storage.files.has(key)).toBe(false);
    await request(t.http)
      .get(`/api/v1/media/${loose.body.data.id}`)
      .set(as(owner.token))
      .expect(404);
  });
});

describe('POST /media/:mediaId/complete', () => {
  it('marks a pending upload ready only once the file exists', async () => {
    const owner = await user();
    const other = await user();
    const key = 'posts/images/2026/11/pending-upload.png';
    const { insertedId } = await t.connection.collection('media').insertOne({
      ownerId: owner.id,
      mediaType: 'image',
      status: 'pending',
      variant: 'original',
      fileName: 'pending.png',
      mimeType: 'image/png',
      size: 2048,
      storageProvider: 'ftp',
      storageKey: key,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const url = `/api/v1/media/${insertedId.toString()}/complete`;

    await request(t.http).post(url).set(as(owner.token)).expect(409);
    await request(t.http).post(url).set(as(other.token)).expect(404);

    await t.storage.upload(pad(PNG_HEADER), key, 'image/png');
    const checksum = 'a'.repeat(64);
    const done = await request(t.http)
      .post(url)
      .set(as(owner.token))
      .send({ checksum })
      .expect(200);
    expect(done.body.data).toMatchObject({
      status: 'ready',
      fileUrl: expect.any(String),
    });

    // Repeating is harmless; a malformed checksum is still rejected.
    await request(t.http).post(url).set(as(owner.token)).expect(200);
    await request(t.http)
      .post(url)
      .set(as(owner.token))
      .send({ checksum: 'nope' })
      .expect(400);
  });
});
