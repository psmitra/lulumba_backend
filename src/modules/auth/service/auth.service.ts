import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { AppLogger } from '@common/logger/logger.service.js';
import {
  pkceS256Challenge,
  randomToken,
  safeEqual,
} from '@common/utils/crypto.util.js';
import type { ProfileEntity } from '@app-types/profile.types.js';
import { ProfileResponseDto } from '@modules/profiles/dto/profile-response.dto.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import {
  ForbiddenException,
  Injectable,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeJwt } from 'jose';
import {
  GhanaWorksClient,
  GhanaWorksError,
} from '../ghanaworks/ghanaworks.client.js';
import type {
  AuthorizeOptions,
  GhanaWorksUser,
  TokenSet,
} from '../ghanaworks/ghanaworks.client.js';
import type { AuthContext } from '../interfaces/auth-context.interface.js';

export interface LoginStart {
  authorizeUrl: string;
  /**
   * `<state>.<verifier>[.none]`, kept in the OAuth cookie until the callback.
   * The `.none` suffix marks a silent (`prompt=none`) login.
   */
  oauthCookie: string;
}

export interface LoginResult {
  tokens: TokenSet;
  /** GhanaWorks /api/v1/auth/me */
  user: GhanaWorksUser;
  profile: ProfileEntity;
}

const SILENT_MARK = 'none';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly devShowTokens: boolean;

  constructor(
    private readonly ghanaWorks: GhanaWorksClient,
    private readonly profiles: ProfilesService,
    private readonly logger: AppLogger,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.devShowTokens = config.get('DEV_SHOW_TOKENS', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (this.devShowTokens) {
      this.logger.warn(
        'DEV_SHOW_TOKENS is enabled: /auth/callback shows the access and refresh tokens instead of redirecting to the frontend',
        AuthService.name,
      );
    }
  }

  startLogin(options: AuthorizeOptions = {}): LoginStart {
    const state = randomToken(16);
    const verifier = randomToken(32);
    const parts = [state, verifier];
    if (options.prompt === 'none') {
      parts.push(SILENT_MARK);
    }
    return {
      authorizeUrl: this.ghanaWorks.authorizeUrl(
        state,
        pkceS256Challenge(verifier),
        options,
      ),
      oauthCookie: parts.join('.'),
    };
  }

  /** Whether the OAuth cookie belongs to a `prompt=none` login. */
  isSilentLogin(oauthCookie: string | undefined): boolean {
    return (oauthCookie ?? '').split('.')[2] === SILENT_MARK;
  }

  /**
   * Finishes the redirect from GhanaWorks: checks `state` against the cookie
   * set by startLogin, exchanges the code (with PKCE and the client secret)
   * and syncs the user's profile from /auth/me. Only active normal user
   * accounts may sign in.
   */
  async completeLogin(
    code: string,
    state: string,
    oauthCookie: string | undefined,
  ): Promise<LoginResult> {
    const [expectedState, verifier] = (oauthCookie ?? '').split('.');
    if (!expectedState || !verifier || !safeEqual(state, expectedState)) {
      throw new UnauthorizedException('Invalid login state');
    }

    const tokens = await this.ghanaWorks.exchangeCode(code, verifier);
    const user = await this.ghanaWorks.me(tokens.access_token);
    assertAllowedAccount(user);
    const profile = await this.profiles.syncFromGhanaWorks(user);
    if (!profile.isActive) {
      throw new ForbiddenException('This social profile is disabled');
    }
    return { tokens, user, profile };
  }

  /**
   * Renews the token pair, then checks the user with GhanaWorks /auth/me.
   * React calls this on every app load, so this is where the app is gated
   * on /auth/me (hand-off §4).
   *
   * Only a definite answer ends the session (UnauthorizedException or
   * ForbiddenException). If GhanaWorks can't answer right now (429, 5xx,
   * unreachable), the refresh fails with ServiceUnavailableException and
   * the refresh token stays valid for a retry.
   */
  async refresh(refreshToken: string): Promise<TokenSet> {
    let tokens: TokenSet;
    try {
      tokens = await this.ghanaWorks.refresh(refreshToken);
    } catch (error) {
      if (error instanceof GhanaWorksError && error.isRejection) {
        throw new UnauthorizedException('Session ended, please sign in again');
      }
      this.logger.warn(
        `GhanaWorks refresh failed: ${(error as Error).message}`,
        AuthService.name,
      );
      throw new ServiceUnavailableException(
        'GhanaWorks is unavailable, please try again',
      );
    }

    await this.checkSession(tokens.access_token);
    return tokens;
  }

  /**
   * Resolves a bearer token to the caller: a GhanaWorks access token that was
   * issued after the user's last logout.
   */
  async authenticate(accessToken: string): Promise<AuthContext> {
    let token: { sub: string; iat: number };
    try {
      token = await this.ghanaWorks.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return this.contextFor(token.sub, accessToken, token.iat);
  }

  async me(auth: AuthContext): Promise<ProfileResponseDto> {
    const profile = await this.profiles.findByExternalUserId(
      auth.externalUserId,
    );
    if (!profile) {
      throw new UnauthorizedException('Please sign in again');
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  /** Ends the session here at once, then logs out of GhanaWorks (§3.5). */
  async logout(auth: AuthContext): Promise<void> {
    await this.profiles.markLoggedOut(auth.externalUserId);
    try {
      await this.ghanaWorks.logout(auth.accessToken);
    } catch (error) {
      // Our side is already logged out; GhanaWorks will expire its tokens.
      this.logger.warn(
        `GhanaWorks logout failed: ${(error as Error).message}`,
        AuthService.name,
      );
    }
  }

  /** §6 - GhanaWorks says the user logged out somewhere. */
  async backchannelLogout(logoutToken: string): Promise<void> {
    let userId: string;
    try {
      userId = await this.ghanaWorks.verifyLogoutToken(logoutToken);
    } catch {
      throw new UnauthorizedException('Invalid logout token');
    }
    await this.profiles.markLoggedOut(userId);
  }

  /**
   * The /auth/me step of refresh(). The refresh token has already rotated,
   * so a GhanaWorks hiccup here keeps the new (locally verifiable) tokens
   * rather than losing the session. When GhanaWorks rejects the user, the
   * access tokens issued before now stop working too.
   */
  private async checkSession(accessToken: string): Promise<void> {
    let user: GhanaWorksUser;
    try {
      user = await this.ghanaWorks.me(accessToken);
    } catch (error) {
      if (error instanceof GhanaWorksError && error.isRejection) {
        // Fresh from GhanaWorks' token endpoint, so its `sub` is trusted.
        const { sub } = decodeJwt(accessToken);
        if (sub) {
          await this.profiles.markLoggedOut(sub);
        }
        throw new UnauthorizedException('Session ended, please sign in again');
      }
      this.logger.warn(
        `GhanaWorks /auth/me failed during refresh, keeping the session: ${(error as Error).message}`,
        AuthService.name,
      );
      return;
    }

    try {
      assertAllowedAccount(user);
    } catch (error) {
      await this.profiles.markLoggedOut(String(user.id));
      throw error;
    }
    const profile = await this.profiles.syncFromGhanaWorks(user);
    if (!profile.isActive) {
      throw new ForbiddenException('This social profile is disabled');
    }
  }

  private async contextFor(
    externalUserId: string,
    accessToken: string,
    issuedAt: number,
  ): Promise<AuthContext> {
    const profile = await this.profiles.findByExternalUserId(externalUserId);
    if (!profile) {
      throw new UnauthorizedException('Please sign in again');
    }
    if (!profile.isActive) {
      throw new ForbiddenException('This social profile is disabled');
    }
    // `iat` has second precision, so a token from the same second as the
    // logout is treated as older (safe side) and rejected too.
    if (
      profile.loggedOutAt &&
      Math.floor(issuedAt) <= Math.floor(profile.loggedOutAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Logged out, please sign in again');
    }
    return {
      externalUserId,
      profileId: profile.id,
      accessToken,
    };
  }
}

/** GhanaWorks SSO is for normal, active user accounts only. */
function assertAllowedAccount(user: GhanaWorksUser): void {
  if (user.account_type !== 'user' || user.status !== 'active') {
    throw new ForbiddenException(
      'Only active GhanaWorks user accounts can sign in',
    );
  }
}
