import type { EnvironmentVariables } from '@common/config/env.validation.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import type { ProfileResponseDto } from '@modules/profiles/dto/profile-response.dto.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { OAUTH_COOKIE, REFRESH_COOKIE } from '../auth.constants.js';
import { CurrentAuth } from '../decorators/current-auth.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import type { TokenSet } from '../ghanaworks/ghanaworks.client.js';
import { CsrfGuard } from '../guards/csrf.guard.js';
import type { AuthContext } from '../interfaces/auth-context.interface.js';
import { AuthService } from '../service/auth.service.js';

export interface AccessTokenResponse {
  accessToken: string;
  expiresIn: number;
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
    this.secureCookies = config.get('COOKIE_SECURE', { infer: true });
  }

  /** Step 1: the "Sign in" link. Redirects to GhanaWorks. */
  @Public()
  @Get('login')
  login(@Res() res: Response): void {
    const { authorizeUrl, oauthCookie } = this.auth.startLogin();
    res.cookie(OAUTH_COOKIE.name, oauthCookie, this.cookie(OAUTH_COOKIE));
    res.redirect(authorizeUrl);
  }

  /**
   * Step 2: GhanaWorks redirects back here. On success the refresh token is
   * stored in an HttpOnly cookie and the browser goes to the React app,
   * which then calls POST /auth/refresh for its access token.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const oauthCookie = readCookie(req, OAUTH_COOKIE.name);
    res.clearCookie(OAUTH_COOKIE.name, this.cookie(OAUTH_COOKIE, false));

    if (error || !code || !state) {
      return this.backToFrontend(res, error ?? 'invalid_request');
    }
    try {
      const tokens = await this.auth.completeLogin(code, state, oauthCookie);
      this.setRefreshCookie(res, tokens);
      this.backToFrontend(res);
    } catch {
      this.backToFrontend(res, 'login_failed');
    }
  }

  /** Step 3: React gets (and later renews) its access token. */
  @Public()
  @UseGuards(CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AccessTokenResponse>> {
    const refreshToken = readCookie(req, REFRESH_COOKIE.name);
    try {
      if (!refreshToken) {
        throw new UnauthorizedException('Not signed in');
      }
      const tokens = await this.auth.refresh(refreshToken);
      this.setRefreshCookie(res, tokens);
      return successResponse({
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in,
      });
    } catch {
      // Logged out or disabled in GhanaWorks (§3.3): end the session.
      res.clearCookie(REFRESH_COOKIE.name, this.cookie(REFRESH_COOKIE, false));
      throw new UnauthorizedException('Session ended, please sign in again');
    }
  }

  @Get('me')
  async me(
    @CurrentAuth() auth: AuthContext,
  ): Promise<ApiResponse<ProfileResponseDto>> {
    return successResponse(await this.auth.me(auth));
  }

  /** Logs out of the social app, GhanaWorks and every other portal. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    res.clearCookie(REFRESH_COOKIE.name, this.cookie(REFRESH_COOKIE, false));
  }

  /** GhanaWorks back-channel logout (§6), form-encoded `logout_token`. */
  @Public()
  @Post('backchannel-logout')
  @HttpCode(HttpStatus.OK)
  async backchannelLogout(
    @Body('logout_token') logoutToken: unknown,
  ): Promise<void> {
    if (typeof logoutToken !== 'string' || !logoutToken) {
      throw new BadRequestException('logout_token is required');
    }
    await this.auth.backchannelLogout(logoutToken);
  }

  private setRefreshCookie(res: Response, tokens: TokenSet): void {
    res.cookie(
      REFRESH_COOKIE.name,
      tokens.refresh_token,
      this.cookie(REFRESH_COOKIE),
    );
  }

  private backToFrontend(res: Response, error?: string): void {
    const url = new URL(this.frontendUrl);
    if (error) {
      url.searchParams.set('auth_error', error);
    }
    res.redirect(url.toString());
  }

  // Host-only (no Domain), HttpOnly cookies scoped to the auth routes.
  private cookie(
    spec: typeof REFRESH_COOKIE | typeof OAUTH_COOKIE,
    withMaxAge = true,
  ): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: spec.sameSite,
      path: spec.path,
      ...(withMaxAge ? { maxAge: spec.maxAgeMs } : {}),
    };
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}
