import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { AppLogger } from '@common/logger/logger.service.js';
import {
  pkceS256Challenge,
  randomToken,
  safeEqual,
} from '@common/utils/crypto.util.js';
import { ProfileResponseDto } from '@modules/profiles/dto/profile-response.dto.js';
import { ProfilesService } from '@modules/profiles/service/profiles.service.js';
import {
  ForbiddenException,
  Injectable,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEV_USER } from '../dev/dev-user.js';
import { GhanaWorksClient } from '../ghanaworks/ghanaworks.client.js';
import type { TokenSet } from '../ghanaworks/ghanaworks.client.js';
import type { AuthContext } from '../interfaces/auth-context.interface.js';

export interface LoginStart {
  authorizeUrl: string;
  /** `<state>.<verifier>`, kept in the OAuth cookie until the callback. */
  oauthCookie: string;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly devToken?: string;

  constructor(
    private readonly ghanaWorks: GhanaWorksClient,
    private readonly profiles: ProfilesService,
    private readonly logger: AppLogger,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.devToken = config.get('DEV_AUTH_TOKEN', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.devToken) {
      await this.profiles.syncFromGhanaWorks(DEV_USER);
      this.logger.warn(
        `DEV_AUTH_TOKEN is enabled: requests with it act as dev user ${DEV_USER.id}`,
        AuthService.name,
      );
    }
  }

  startLogin(): LoginStart {
    const state = randomToken(16);
    const verifier = randomToken(32);
    return {
      authorizeUrl: this.ghanaWorks.authorizeUrl(
        state,
        pkceS256Challenge(verifier),
      ),
      oauthCookie: `${state}.${verifier}`,
    };
  }

  /**
   * Finishes the redirect from GhanaWorks: checks `state` against the cookie
   * set by startLogin, exchanges the code (with PKCE and the client secret)
   * and syncs the user's profile from /auth/me.
   */
  async completeLogin(
    code: string,
    state: string,
    oauthCookie: string | undefined,
  ): Promise<TokenSet> {
    const [expectedState, verifier] = (oauthCookie ?? '').split('.');
    if (!expectedState || !verifier || !safeEqual(state, expectedState)) {
      throw new UnauthorizedException('Invalid login state');
    }

    const tokens = await this.ghanaWorks.exchangeCode(code, verifier);
    const user = await this.ghanaWorks.me(tokens.access_token);
    const profile = await this.profiles.syncFromGhanaWorks(user);
    if (!profile.isActive) {
      throw new ForbiddenException('This social profile is disabled');
    }
    return tokens;
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return this.ghanaWorks.refresh(refreshToken);
  }

  /**
   * Resolves a bearer token to the caller: the dev token in development,
   * otherwise a GhanaWorks access token that was issued after the user's
   * last logout.
   */
  async authenticate(accessToken: string): Promise<AuthContext> {
    if (this.devToken && safeEqual(accessToken, this.devToken)) {
      return this.contextFor(String(DEV_USER.id), accessToken);
    }

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
    if (auth.accessToken === this.devToken) {
      return;
    }
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

  private async contextFor(
    externalUserId: string,
    accessToken: string,
    issuedAt?: number,
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
      issuedAt !== undefined &&
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
