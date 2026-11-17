import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { API_BASE_PATH } from '@common/constants/api.constants.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { SWAGGER_AUTH } from '@common/swagger/swagger.setup.js';
import { ProfileResponseDto } from '@modules/profiles/dto/profile-response.dto.js';
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
import {
  ApiBody,
  ApiConsumes,
  ApiExcludeEndpoint,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { decodeJwt } from 'jose';
import {
  CSRF_HEADER,
  OAUTH_COOKIE,
  REFRESH_COOKIE,
} from '../auth.constants.js';
import { CurrentAuth } from '../decorators/current-auth.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { AccessTokenResponseDto } from '../dto/access-token-response.dto.js';
import type { TokenSet } from '../ghanaworks/ghanaworks.client.js';
import { CsrfGuard } from '../guards/csrf.guard.js';
import type { AuthContext } from '../interfaces/auth-context.interface.js';
import { AuthService } from '../service/auth.service.js';
import type { LoginResult } from '../service/auth.service.js';

@ApiTags('auth')
@ApiErrorResponses(HttpStatus.TOO_MANY_REQUESTS)
@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;
  private readonly secureCookies: boolean;
  private readonly devShowTokens: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
    this.secureCookies = config.get('COOKIE_SECURE', { infer: true });
    this.devShowTokens = config.get('DEV_SHOW_TOKENS', { infer: true });
  }

  /** Step 1: the "Sign in" link. Redirects to GhanaWorks. */
  @Public()
  @Get('login')
  @ApiOperation({
    summary: 'Start GhanaWorks sign-in',
    description:
      'Open in the browser (not via "Try it out"): redirects to GhanaWorks.',
  })
  @ApiFoundResponse({ description: 'Redirect to the GhanaWorks login page' })
  login(@Res() res: Response): void {
    const { authorizeUrl, oauthCookie } = this.auth.startLogin();
    res.cookie(OAUTH_COOKIE.name, oauthCookie, this.cookie(OAUTH_COOKIE));
    res.redirect(authorizeUrl);
  }

  /**
   * Step 2: GhanaWorks redirects back here. On success the refresh token is
   * stored in an HttpOnly cookie and the browser goes to the React app,
   * which then calls POST /auth/refresh for its access token.
   * With DEV_SHOW_TOKENS=true it shows the tokens as JSON instead.
   */
  @Public()
  @Get('callback')
  @ApiExcludeEndpoint()
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
    let login: LoginResult;
    try {
      login = await this.auth.completeLogin(code, state, oauthCookie);
    } catch {
      return this.backToFrontend(res, 'login_failed');
    }
    this.setRefreshCookie(res, login.tokens);
    if (this.devShowTokens) {
      return this.showTokens(req, res, login);
    }
    this.backToFrontend(res);
  }

  /** Step 3: React gets (and later renews) its access token. */
  @Public()
  @UseGuards(CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get or renew the access token',
    description:
      `Authenticated by the \`${REFRESH_COOKIE.name}\` cookie. Must come from ` +
      `FRONTEND_URL with \`${CSRF_HEADER}: 1\`, so it can't be tried from here.`,
  })
  // Cookie AND header: one requirement object holding both schemes.
  @ApiSecurity({ [SWAGGER_AUTH.refreshCookie]: [], [SWAGGER_AUTH.csrf]: [] })
  @ApiSuccessResponse(AccessTokenResponseDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AccessTokenResponseDto>> {
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
  @ApiOperation({ summary: "The signed-in user's profile" })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async me(
    @CurrentAuth() auth: AuthContext,
  ): Promise<ApiResponse<ProfileResponseDto>> {
    return successResponse(await this.auth.me(auth));
  }

  /** Logs out of the social app, GhanaWorks and every other portal. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out everywhere (app, GhanaWorks, portals)' })
  @ApiNoContentResponse({ description: 'Signed out; refresh cookie cleared' })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
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
  @ApiOperation({
    summary: 'GhanaWorks back-channel logout',
    description: 'Called server-to-server by GhanaWorks, not by clients.',
  })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['logout_token'],
      properties: { logout_token: { type: 'string' } },
    },
  })
  @ApiOkResponse({ description: 'Sessions for that user ended' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
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

  /**
   * DEV_SHOW_TOKENS (never in production): the login result as JSON, so the
   * API can be tried from Swagger, Postman or curl without a frontend.
   */
  private showTokens(req: Request, res: Response, login: LoginResult): void {
    const { tokens, user, profile } = login;
    const api = `${req.protocol}://${req.get('host')}`;
    const auth = `${api}${API_BASE_PATH}/auth`;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      warning:
        'Development only (DEV_SHOW_TOKENS=true). Never enable in production.',
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      refreshToken: tokens.refresh_token,
      accessTokenClaims: decodeJwt(tokens.access_token),
      ghanaWorksUser: user,
      profile: ProfileResponseDto.fromEntity(profile),
      howTo: {
        callTheApi: 'Send the header  Authorization: Bearer <accessToken>',
        swagger: `${api}/docs -> Authorize -> paste accessToken`,
        curl: `curl.exe ${auth}/me -H "Authorization: Bearer ${tokens.access_token}"`,
        newAccessToken:
          `Open ${auth}/login again. Or POST ${auth}/refresh with headers ` +
          `Origin: ${new URL(this.frontendUrl).origin}, ${CSRF_HEADER}: 1, ` +
          `Cookie: ${REFRESH_COOKIE.name}=<refreshToken>. ` +
          'Each refresh token works once; the response cookie holds the next one.',
      },
    });
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
