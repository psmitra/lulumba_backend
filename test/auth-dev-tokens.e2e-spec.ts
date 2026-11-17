import request from 'supertest';
import { FRONTEND_URL, startTestApp } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp('lulumba_auth_dev_tokens_e2e', {
    DEV_SHOW_TOKENS: 'true',
  });
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

function cookiePair(res: request.Response, name: string): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((value) => value.startsWith(`${name}=`))!.split(';')[0]!;
}

describe('DEV_SHOW_TOKENS', () => {
  it('shows working tokens on the callback instead of redirecting', async () => {
    const user = t.newUser({ name: 'Ama Mensah' });
    const login = await request(t.http).get('/api/v1/auth/login').expect(302);
    const location = new URL(login.headers.location as string);
    const code = t.ghanaWorks.issueCode(
      user,
      location.searchParams.get('code_challenge')!,
    );

    const res = await request(t.http)
      .get('/api/v1/auth/callback')
      .query({ code, state: location.searchParams.get('state') })
      .set('Cookie', cookiePair(login, 'lulumba_oauth'))
      .expect(200);

    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body).toMatchObject({
      expiresIn: 900,
      accessTokenClaims: { sub: String(user.id) },
      ghanaWorksUser: { id: user.id },
      profile: { externalUserId: String(user.id), displayName: 'Ama Mensah' },
    });
    // The browser cookie is still set, as without the flag.
    expect(cookiePair(res, 'lulumba_rt')).toBe(
      `lulumba_rt=${res.body.refreshToken}`,
    );

    await request(t.http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    await request(t.http)
      .post('/api/v1/auth/refresh')
      .set({ Origin: FRONTEND_URL, 'x-csrf-protection': '1' })
      .set('Cookie', `lulumba_rt=${res.body.refreshToken}`)
      .expect(200);
  });

  it('still sends login failures to the frontend', async () => {
    const res = await request(t.http)
      .get('/api/v1/auth/callback')
      .query({ code: 'x', state: 'forged' })
      .expect(302);
    expect(res.headers.location).toBe(
      `${FRONTEND_URL}/?auth_error=login_failed`,
    );
  });

  it('is refused in production', async () => {
    const { validateEnv } = await import('@common/config/env.validation.js');
    expect(() =>
      validateEnv({
        ...process.env,
        APP_ENV: 'production',
        DEV_SHOW_TOKENS: 'true',
      }),
    ).toThrow(/DEV_SHOW_TOKENS/);
  });
});
