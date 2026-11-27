import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, SignJWT } from 'jose';
import type { JWTPayload } from 'jose';
import type { GhanaWorksUser } from '@modules/auth/ghanaworks/ghanaworks.client.js';

export const CLIENT_ID = '3';
export const CLIENT_SECRET = 'test-client-secret';
const KID = 'gw-test';

interface PendingCode {
  user: GhanaWorksUser;
  codeChallenge: string;
  redirectUri: string;
}

/**
 * In-process stand-in for GhanaWorks, implementing the endpoints of its SSO
 * guide: /oauth/token, /api/v1/auth/me, /api/v1/auth/logout and JWKS.
 */
export class FakeGhanaWorks {
  readonly privateKey: KeyObject;
  readonly logoutCalls: string[] = [];
  baseUrl = '';
  redirectUri = '';

  private readonly server: Server;
  private readonly codes = new Map<string, PendingCode>();
  private readonly refreshTokens = new Map<string, GhanaWorksUser>();
  private readonly accessTokens = new Map<string, GhanaWorksUser>();
  /** Changes made in GhanaWorks after sign-in, by user id. */
  private readonly userChanges = new Map<number, Partial<GhanaWorksUser>>();
  /** Users whose tokens /auth/me rejects with 401 (e.g. deactivated). */
  private readonly rejectedUsers = new Set<number>();
  /** One-shot failures, per path: the next request gets this answer. */
  private readonly failures = new Map<
    string,
    { status: number; body: unknown }
  >();

  constructor() {
    this.privateKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    }).privateKey;
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** What GhanaWorks does after the user signs in on /oauth/authorize. */
  issueCode(user: GhanaWorksUser, codeChallenge: string): string {
    const code = randomUUID();
    this.codes.set(code, {
      user,
      codeChallenge,
      redirectUri: this.redirectUri,
    });
    return code;
  }

  /** The user is edited in GhanaWorks; /auth/me shows it from now on. */
  changeUser(id: number, changes: Partial<GhanaWorksUser>): void {
    this.userChanges.set(id, { ...this.userChanges.get(id), ...changes });
  }

  /** GhanaWorks' /auth/me answers 401 for this user's tokens. */
  rejectUser(id: number): void {
    this.rejectedUsers.add(id);
  }

  /** The next request to `path` fails with `status` (e.g. 429, 503). */
  failNext(path: string, status: number, body: unknown = {}): void {
    this.failures.set(path, { status, body });
  }

  /** Signs a token with GhanaWorks' key (or another `key`). */
  sign(claims: JWTPayload, key: KeyObject = this.privateKey): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      jti: randomUUID(),
      iat: now,
      exp: now + 900,
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .sign(key);
  }

  logoutToken(sub: string, claims: JWTPayload = {}, key?: KeyObject) {
    return this.sign(
      {
        iss: this.baseUrl,
        aud: CLIENT_ID,
        sub,
        exp: Math.floor(Date.now() / 1000) + 300,
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        ...claims,
      },
      key,
    );
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

    const failure = this.failures.get(url.pathname);
    if (failure) {
      this.failures.delete(url.pathname);
      return json(res, failure.status, failure.body);
    }
    if (url.pathname === '/.well-known/jwks.json') {
      const publicJwk = await exportJWK(this.privateKey);
      const { n, e, kty } = publicJwk;
      return json(res, 200, {
        keys: [{ kty, n, e, kid: KID, alg: 'RS256', use: 'sig' }],
      });
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      return this.token(new URLSearchParams(await body(req)), res);
    }
    if (url.pathname === '/api/v1/auth/me') {
      const user = bearer ? this.accessTokens.get(bearer) : undefined;
      if (!user || this.rejectedUsers.has(user.id)) {
        return json(res, 401, {});
      }
      return json(res, 200, { ...user, ...this.userChanges.get(user.id) });
    }
    if (url.pathname === '/api/v1/auth/logout' && req.method === 'POST') {
      const user = bearer ? this.accessTokens.get(bearer) : undefined;
      if (!user) return json(res, 401, {});
      this.logoutCalls.push(String(user.id));
      for (const [token, owner] of this.refreshTokens) {
        if (owner.id === user.id) this.refreshTokens.delete(token);
      }
      res.writeHead(204).end();
      return;
    }
    json(res, 404, {});
  }

  private async token(form: URLSearchParams, res: ServerResponse) {
    if (
      form.get('client_id') !== CLIENT_ID ||
      form.get('client_secret') !== CLIENT_SECRET
    ) {
      return json(res, 401, { error: 'invalid_client' });
    }

    let user: GhanaWorksUser | undefined;
    if (form.get('grant_type') === 'authorization_code') {
      const pending = this.codes.get(form.get('code') ?? '');
      this.codes.delete(form.get('code') ?? '');
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url');
      if (
        pending &&
        pending.redirectUri === form.get('redirect_uri') &&
        pending.codeChallenge === challenge
      ) {
        user = pending.user;
      }
    } else if (form.get('grant_type') === 'refresh_token') {
      const token = form.get('refresh_token') ?? '';
      user = this.refreshTokens.get(token);
      this.refreshTokens.delete(token); // rotation: one use only
    }
    if (!user) {
      return json(res, 400, { error: 'invalid_grant' });
    }

    const accessToken = await this.sign({
      aud: CLIENT_ID,
      sub: String(user.id),
    });
    const refreshToken = randomUUID();
    this.accessTokens.set(accessToken, user);
    this.refreshTokens.set(refreshToken, user);
    json(res, 200, {
      token_type: 'Bearer',
      expires_in: 900,
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function body(req: IncomingMessage): Promise<string> {
  let data = '';
  for await (const chunk of req) data += String(chunk);
  return data;
}
