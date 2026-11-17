import type { GhanaWorksUser } from '@modules/auth/ghanaworks/ghanaworks.client.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { CLIENT_ID, CLIENT_SECRET, FakeGhanaWorks } from './fake-ghanaworks.js';
import { MemoryStorageProvider } from './memory-storage.js';

export const FRONTEND_URL = 'https://social.example.test';
const REDIRECT_URI = 'https://api.social.example.test/api/v1/auth/callback';
const CSRF = { Origin: FRONTEND_URL, 'x-csrf-protection': '1' };

export interface TestUser {
  id: string;
  name: string;
  token: string;
}

export interface TestApp {
  app: NestExpressApplication;
  http: App;
  connection: Connection;
  ghanaWorks: FakeGhanaWorks;
  /** Replaces the FTP provider, so uploads never leave the process. */
  storage: MemoryStorageProvider;
  /** A fresh GhanaWorks user with a unique id. */
  newUser(overrides?: Partial<GhanaWorksUser>): GhanaWorksUser;
  /** Full sign-in through the fake GhanaWorks; returns an access token. */
  signIn(user: GhanaWorksUser): Promise<string>;
  /** A new, signed-in user. */
  user(): Promise<TestUser>;
  /** A post by `owner` with one ready image; returns its id. */
  createPost(
    owner: TestUser,
    visibility?: 'public' | 'followers',
  ): Promise<string>;
  stop(): Promise<void>;
}

/**
 * The real app against in-memory MongoDB and a fake GhanaWorks, configured
 * like production by configureApp(). One per spec file.
 */
export async function startTestApp(database: string): Promise<TestApp> {
  const mongo = await MongoMemoryServer.create();
  const ghanaWorks = new FakeGhanaWorks();
  await ghanaWorks.start();
  ghanaWorks.redirectUri = REDIRECT_URI;

  const mongoUrl = new URL(mongo.getUri());
  // Set before AppModule loads. Empty values stop a developer's .env from
  // leaking in: dotenv never overrides variables that already exist.
  Object.assign(process.env, {
    APP_ENV: 'test',
    LOG_LEVEL: 'fatal',
    MONGODB_HOST: mongoUrl.hostname,
    MONGODB_PORT: mongoUrl.port,
    MONGODB_SRV: 'false',
    MONGODB_DATABASE: database,
    MONGODB_USERNAME: '',
    MONGODB_PASSWORD: '',
    MONGODB_OPTIONS: '',
    MONGODB_DNS_SERVERS: '',
    GHANAWORKS_URL: ghanaWorks.baseUrl,
    GHANAWORKS_CLIENT_ID: CLIENT_ID,
    GHANAWORKS_CLIENT_SECRET: CLIENT_SECRET,
    GHANAWORKS_REDIRECT_URI: REDIRECT_URI,
    FRONTEND_URL,
    THROTTLE_LIMIT: '10000',
    DEV_AUTH_TOKEN: '',
    // Validated at startup; never connected to.
    STORAGE_DRIVER: 'ftp',
    FTP_HOST: 'ftp.invalid',
    FTP_USERNAME: 'test',
    FTP_PASSWORD: 'test',
    FTP_PUBLIC_BASE_URL: 'https://cdn.example.test/media',
    // Small, so the quota is reachable with small test files.
    STORAGE_USER_QUOTA_MB: '1',
  });

  const { validateEnv } = await import('@common/config/env.validation.js');
  const { createDatabaseConnection } =
    await import('@common/config/database.config.js');
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const { STORAGE_PROVIDER } =
    await import('@common/storage/storage.constants.js');
  const storage = new MemoryStorageProvider();

  const env = validateEnv(process.env);
  const connection = await createDatabaseConnection(env);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(connection)],
  })
    .overrideProvider(STORAGE_PROVIDER)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  await connection.syncIndexes();
  const http = app.getHttpServer() as App;

  let lastUserId = 7000;
  const newUser = (overrides: Partial<GhanaWorksUser> = {}) => {
    lastUserId += 1;
    return {
      id: lastUserId,
      account_type: 'user',
      name: `User ${lastUserId}`,
      image_url: null,
      status: 'active',
      ...overrides,
    } satisfies GhanaWorksUser;
  };

  const signIn = async (user: GhanaWorksUser) => {
    const login = await request(http).get('/api/v1/auth/login').expect(302);
    const location = new URL(login.headers.location as string);
    const code = ghanaWorks.issueCode(
      user,
      location.searchParams.get('code_challenge')!,
    );
    const callback = await request(http)
      .get('/api/v1/auth/callback')
      .query({ code, state: location.searchParams.get('state') })
      .set('Cookie', cookiePair(login, 'lulumba_oauth'))
      .expect(302);
    const refreshed = await request(http)
      .post('/api/v1/auth/refresh')
      .set(CSRF)
      .set('Cookie', cookiePair(callback, 'lulumba_rt'))
      .expect(200);
    return refreshed.body.data.accessToken as string;
  };

  const user = async (): Promise<TestUser> => {
    const ghanaWorksUser = newUser();
    return {
      id: String(ghanaWorksUser.id),
      name: ghanaWorksUser.name,
      token: await signIn(ghanaWorksUser),
    };
  };

  let mediaCount = 0;
  const createPost = async (
    owner: TestUser,
    visibility: 'public' | 'followers' = 'public',
  ) => {
    mediaCount += 1;
    const { insertedId } = await connection.collection('media').insertOne({
      ownerId: owner.id,
      mediaType: 'image',
      status: 'ready',
      variant: 'original',
      fileName: 'photo.webp',
      mimeType: 'image/webp',
      size: 100,
      storageProvider: 'ftp',
      storageKey: `posts/images/helper-${mediaCount}.webp`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await request(http)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        visibility,
        attachments: [{ mediaId: insertedId.toString(), sortOrder: 0 }],
      })
      .expect(201);
    return res.body.data.id as string;
  };

  return {
    app,
    user,
    createPost,
    http,
    connection,
    ghanaWorks,
    storage,
    newUser,
    signIn,
    stop: async () => {
      await app.close();
      await ghanaWorks.stop();
      await mongo.stop();
    },
  };
}

function cookiePair(res: request.Response, name: string): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`No ${name} cookie in response`);
  return cookie.split(';')[0]!;
}
