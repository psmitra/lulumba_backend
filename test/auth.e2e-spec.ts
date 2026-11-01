import type { GhanaWorksUser } from '@modules/auth/ghanaworks/ghanaworks.client.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  FakeGhanaWorks,
} from './utils/fake-ghanaworks.js';

const FRONTEND_URL = 'https://social.example.test';
const REDIRECT_URI = 'https://api.social.example.test/auth/callback';
const DEV_TOKEN = 'dev-token-for-e2e-tests';
const CSRF = { Origin: FRONTEND_URL, 'x-csrf-protection': '1' };

let mongo: MongoMemoryServer;
let ghanaWorks: FakeGhanaWorks;
let connection: Connection;
let app: NestExpressApplication;
let http: App;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  ghanaWorks = new FakeGhanaWorks();
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
    MONGODB_DATABASE: 'lulumba_auth_e2e',
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
    DEV_AUTH_TOKEN: DEV_TOKEN,
    // Validated at startup; never connected to by these tests.
    STORAGE_DRIVER: 'ftp',
    FTP_HOST: 'ftp.invalid',
    FTP_USERNAME: 'test',
    FTP_PASSWORD: 'test',
  });

  const { validateEnv } = await import('@common/config/env.validation.js');
  const { createDatabaseConnection } =
    await import('@common/config/database.config.js');
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');

  const env = validateEnv(process.env);
  connection = await createDatabaseConnection(env);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(connection)],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  await connection.syncIndexes();
  http = app.getHttpServer() as App;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await ghanaWorks?.stop();
  await mongo?.stop();
});

let lastUserId = 2000;
function ghanaWorksUser(
  overrides: Partial<GhanaWorksUser> = {},
): GhanaWorksUser {
  lastUserId += 1;
  return {
    id: lastUserId,
    account_type: 'user',
    name: `User ${lastUserId}`,
    image_url: `https://ghanaworks.test/pic/${lastUserId}.jpg`,
    status: 'active',
    ...overrides,
  };
}

function cookieFrom(res: request.Response, name: string): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

const pair = (setCookie: string) => setCookie.split(';')[0];

/** GET /auth/login, then what GhanaWorks would redirect back with. */
async function startLogin(user: GhanaWorksUser) {
  const res = await request(http).get('/auth/login').expect(302);
  const location = new URL(res.headers.location as string);
  const code = ghanaWorks.issueCode(
    user,
    location.searchParams.get('code_challenge')!,
  );
  return {
    location,
    code,
    state: location.searchParams.get('state')!,
    oauthCookie: cookieFrom(res, 'lulumba_oauth')!,
  };
}

/** Full sign-in: login -> GhanaWorks -> callback -> refresh. */
async function signIn(user: GhanaWorksUser) {
  const { code, state, oauthCookie } = await startLogin(user);
  const callback = await request(http)
    .get('/auth/callback')
    .query({ code, state })
    .set('Cookie', pair(oauthCookie))
    .expect(302);
  expect(callback.headers.location).toBe(`${FRONTEND_URL}/`);

  const refreshed = await refresh(pair(cookieFrom(callback, 'lulumba_rt')!));
  expect(refreshed.status).toBe(200);
  return {
    accessToken: refreshed.body.data.accessToken as string,
    cookie: pair(cookieFrom(refreshed, 'lulumba_rt')!),
  };
}

function refresh(cookie: string) {
  return request(http).post('/auth/refresh').set(CSRF).set('Cookie', cookie);
}

function me(token: string) {
  return request(http).get('/auth/me').set('Authorization', `Bearer ${token}`);
}

describe('sign in with GhanaWorks', () => {
  it('redirects to GhanaWorks authorize with PKCE and state', async () => {
    const { location, oauthCookie } = await startLogin(ghanaWorksUser());

    expect(`${location.origin}${location.pathname}`).toBe(
      `${ghanaWorks.baseUrl}/oauth/authorize`,
    );
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'profile',
      code_challenge_method: 'S256',
    });
    expect(oauthCookie).toMatch(/HttpOnly/);
    expect(oauthCookie).toMatch(/SameSite=Lax/);
    expect(oauthCookie).toMatch(/Path=\/auth\/callback/);
  });

  it('signs in, creates the profile from /auth/me and keeps tokens out of the URL', async () => {
    const user = ghanaWorksUser({ name: 'Ama Mensah' });
    const { code, state, oauthCookie } = await startLogin(user);

    const callback = await request(http)
      .get('/auth/callback')
      .query({ code, state })
      .set('Cookie', pair(oauthCookie))
      .expect(302);
    expect(callback.headers.location).toBe(`${FRONTEND_URL}/`);
    const refreshCookie = cookieFrom(callback, 'lulumba_rt')!;
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(refreshCookie).toMatch(/SameSite=Strict/);
    expect(refreshCookie).toMatch(/Path=\/auth/);

    const refreshed = await refresh(pair(refreshCookie)).expect(200);
    const profile = await me(refreshed.body.data.accessToken).expect(200);
    expect(profile.body.data).toMatchObject({
      externalUserId: String(user.id),
      displayName: 'Ama Mensah',
      avatarUrl: user.image_url,
    });
  });

  it('updates the same profile on later logins (no duplicates)', async () => {
    const user = ghanaWorksUser();
    await signIn(user);
    await signIn({ ...user, name: 'New Name' });

    const profiles = await connection
      .collection('profiles')
      .find({ externalUserId: String(user.id) })
      .toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].displayName).toBe('New Name');
  });

  it('does not create duplicates under concurrent first logins', async () => {
    const { ProfilesService } =
      await import('@modules/profiles/service/profiles.service.js');
    const profiles = app.get(ProfilesService, { strict: false });
    const user = ghanaWorksUser();

    await Promise.all(
      Array.from({ length: 10 }, () => profiles.syncFromGhanaWorks(user)),
    );
    expect(
      await connection
        .collection('profiles')
        .countDocuments({ externalUserId: String(user.id) }),
    ).toBe(1);
  });

  it('rejects a callback with a wrong or missing state', async () => {
    const { code, oauthCookie } = await startLogin(ghanaWorksUser());

    const wrongState = await request(http)
      .get('/auth/callback')
      .query({ code, state: 'forged' })
      .set('Cookie', pair(oauthCookie))
      .expect(302);
    expect(wrongState.headers.location).toBe(
      `${FRONTEND_URL}/?auth_error=login_failed`,
    );
    expect(cookieFrom(wrongState, 'lulumba_rt')).toBeUndefined();

    const noCookie = await request(http)
      .get('/auth/callback')
      .query({ code, state: 'x' })
      .expect(302);
    expect(noCookie.headers.location).toContain('auth_error=login_failed');
  });

  it('passes GhanaWorks errors back to the frontend', async () => {
    const res = await request(http)
      .get('/auth/callback')
      .query({ error: 'access_denied', state: 'x' })
      .expect(302);
    expect(res.headers.location).toBe(
      `${FRONTEND_URL}/?auth_error=access_denied`,
    );
  });
});

describe('access tokens', () => {
  const otherKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).privateKey;

  it('requires a token on every non-public route', async () => {
    await request(http).get('/auth/me').expect(401);
    await me('not-a-jwt').expect(401);
    await request(http).get('/health').expect(200);
  });

  it('rejects forged, expired and wrong-audience tokens', async () => {
    const user = ghanaWorksUser();
    await signIn(user);
    const sub = String(user.id);
    const now = Math.floor(Date.now() / 1000);

    await me(await ghanaWorks.sign({ aud: CLIENT_ID, sub }, otherKey)).expect(
      401,
    );
    await me(
      await ghanaWorks.sign({
        aud: CLIENT_ID,
        sub,
        iat: now - 1000,
        exp: now - 100,
      }),
    ).expect(401);
    await me(await ghanaWorks.sign({ aud: 'another-portal', sub })).expect(401);
    // Valid GhanaWorks token, but the user never signed in here.
    await me(await ghanaWorks.sign({ aud: CLIENT_ID, sub: '999999' })).expect(
      401,
    );
  });

  it('accepts the dev token as the dev user', async () => {
    const res = await me(DEV_TOKEN).expect(200);
    expect(res.body.data).toMatchObject({
      externalUserId: '1024',
      displayName: 'Ama Mensah',
    });
  });
});

describe('refresh', () => {
  it('rotates the refresh token; the old one stops working', async () => {
    const { cookie } = await signIn(ghanaWorksUser());

    const res = await refresh(cookie).expect(200);
    expect(pair(cookieFrom(res, 'lulumba_rt')!)).not.toBe(cookie);

    const reused = await refresh(cookie).expect(401);
    expect(cookieFrom(reused, 'lulumba_rt')).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
  });

  it('needs the cookie and passes the CSRF check', async () => {
    await request(http).post('/auth/refresh').set(CSRF).expect(401);

    const { cookie } = await signIn(ghanaWorksUser());
    await request(http)
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .set('x-csrf-protection', '1')
      .expect(403);
    await request(http)
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', FRONTEND_URL)
      .expect(403);
  });

  it('allows CORS only from the frontend', async () => {
    const preflight = (origin: string) =>
      request(http)
        .options('/auth/refresh')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');

    const ok = await preflight(FRONTEND_URL);
    expect(ok.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await preflight('https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('logout', () => {
  it('logs out of GhanaWorks, clears the cookie and kills the token at once', async () => {
    const user = ghanaWorksUser();
    const { accessToken, cookie } = await signIn(user);

    const res = await request(http)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    expect(cookieFrom(res, 'lulumba_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(ghanaWorks.logoutCalls).toContain(String(user.id));

    await me(accessToken).expect(401);
    await refresh(cookie).expect(401);
  });

  it('back-channel logout rejects tokens issued before it', async () => {
    const user = ghanaWorksUser();
    const { accessToken } = await signIn(user);
    await me(accessToken).expect(200);

    await request(http)
      .post('/auth/backchannel-logout')
      .type('form')
      .send({ logout_token: await ghanaWorks.logoutToken(String(user.id)) })
      .expect(200);

    await me(accessToken).expect(401);
  });

  it('back-channel logout rejects invalid logout tokens', async () => {
    const user = ghanaWorksUser();
    const { accessToken } = await signIn(user);
    const sub = String(user.id);
    const otherKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    }).privateKey;
    const post = (logoutToken?: string) =>
      request(http)
        .post('/auth/backchannel-logout')
        .type('form')
        .send(logoutToken ? { logout_token: logoutToken } : {});

    await post().expect(400);
    await post(await ghanaWorks.logoutToken(sub, {}, otherKey)).expect(401);
    await post(await ghanaWorks.logoutToken(sub, { aud: 'other' })).expect(401);
    await post(
      await ghanaWorks.logoutToken(sub, { iss: 'https://evil' }),
    ).expect(401);
    await post(await ghanaWorks.logoutToken(sub, { events: {} })).expect(401);

    await me(accessToken).expect(200);
  });
});

describe('API docs', () => {
  it('serves the OpenAPI spec with bearer auth except on public routes', async () => {
    const { body } = await request(http).get('/docs/json').expect(200);

    expect(body.security).toEqual([{ bearer: [] }]);
    expect(body.paths['/auth/me'].get.security).toBeUndefined();
    expect(body.paths['/health'].get.security).toEqual([{}]);
    expect(body.paths['/auth/refresh'].post.security).toEqual([
      { 'refresh-cookie': [], csrf: [] },
    ]);
    expect(body.paths['/auth/callback']).toBeUndefined();
    expect(
      body.paths['/auth/me'].get.responses['200'].content['application/json']
        .schema.properties.data,
    ).toEqual({ $ref: '#/components/schemas/ProfileResponseDto' });
  });
});
