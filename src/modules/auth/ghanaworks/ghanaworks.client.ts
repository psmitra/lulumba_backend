import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Response of POST /oauth/token. */
export interface TokenSet {
  token_type: 'Bearer';
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

/** Response of GET /api/v1/auth/me (fields this app relies on). */
export interface GhanaWorksUser {
  id: number;
  account_type: string;
  first_name?: string | null;
  last_name?: string | null;
  name: string;
  email?: string | null;
  image_url?: string | null;
  status: string;
}

export interface VerifiedAccessToken {
  sub: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
}

/** A non-2xx answer from GhanaWorks. */
export class GhanaWorksError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    /** OAuth `error` from the JSON body, e.g. `invalid_grant`. */
    readonly code?: string,
  ) {
    super(
      `GhanaWorks ${endpoint} responded ${status}${code ? ` (${code})` : ''}`,
    );
    this.name = 'GhanaWorksError';
  }

  /**
   * 400/401: the code or refresh token was rejected, or the user logged out
   * or was disabled. Anything else (429, 5xx) is worth retrying.
   */
  get isRejection(): boolean {
    return this.status === 400 || this.status === 401;
  }
}

export interface AuthorizeOptions {
  /** `none`: no sign-in screen; `access_denied` if not signed in. */
  prompt?: 'none';
}

const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout';
const CLOCK_TOLERANCE_SECONDS = 30;
const TIMEOUT_MS = 10_000;

/**
 * GhanaWorks SSO (OAuth 2.0 Authorization Code + PKCE), as described in
 * GhanaWorks' "SSO Integration" guide. This API is a confidential client:
 * the client secret never leaves the server.
 */
@Injectable()
export class GhanaWorksClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.baseUrl = config
      .get('GHANAWORKS_URL', { infer: true })
      .replace(/\/+$/, '');
    this.clientId = config.get('GHANAWORKS_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('GHANAWORKS_CLIENT_SECRET', { infer: true });
    this.redirectUri = config.get('GHANAWORKS_REDIRECT_URI', { infer: true });
    this.scopes = config.get('GHANAWORKS_SCOPES', { infer: true });
    // The guide allows caching the key for an hour.
    this.jwks = createRemoteJWKSet(
      new URL(`${this.baseUrl}/.well-known/jwks.json`),
      { cacheMaxAge: 60 * 60 * 1000 },
    );
  }

  /** §3.1 - where to send the browser to sign in. */
  authorizeUrl(
    state: string,
    codeChallenge: string,
    options: AuthorizeOptions = {},
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (options.prompt) {
      params.set('prompt', options.prompt);
    }
    return `${this.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  /** §3.2 - authorization code -> tokens. */
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
    return this.token({
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });
  }

  /** §3.3 - a new token pair; the old refresh token stops working. */
  refresh(refreshToken: string): Promise<TokenSet> {
    return this.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  /** §3.4 */
  async me(accessToken: string): Promise<GhanaWorksUser> {
    const response = await this.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return (await response.json()) as GhanaWorksUser;
  }

  /** §3.5 - logs the user out of GhanaWorks and every portal. */
  async logout(accessToken: string): Promise<void> {
    await this.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  /** §4 - signature (JWKS), RS256, expiry and `aud` = our client id. */
  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['RS256'],
      audience: this.clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['sub', 'iat', 'exp'],
    });
    return { sub: String(payload.sub), iat: payload.iat! };
  }

  /** §6 - returns the user id to log out. */
  async verifyLogoutToken(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['RS256'],
      issuer: this.baseUrl,
      audience: this.clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['sub', 'iat', 'exp', 'jti', 'events'],
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (
      !events ||
      typeof events !== 'object' ||
      !(BACKCHANNEL_LOGOUT_EVENT in events)
    ) {
      throw new Error('Not a back-channel logout token');
    }
    return String(payload.sub);
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const response = await this.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    return (await response.json()) as TokenSet;
  }

  private async request(
    path: string,
    init: Omit<RequestInit, 'headers'> & { headers: Record<string, string> },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Unreachable or timed out (status 0: never a rejection).
      throw new GhanaWorksError(0, path, 'unreachable');
    }
    if (!response.ok) {
      throw new GhanaWorksError(
        response.status,
        path,
        await errorCode(response),
      );
    }
    return response;
  }
}

/** The `error` field of a GhanaWorks JSON error body, if any. */
async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body?.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}
