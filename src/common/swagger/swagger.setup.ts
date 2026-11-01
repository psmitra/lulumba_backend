import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { CSRF_HEADER, REFRESH_COOKIE } from '@modules/auth/auth.constants.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './swagger.dto.js';

export const SWAGGER_PATH = 'docs';

/** Security scheme names, as referenced by @ApiSecurity / @ApiCookieAuth. */
export const SWAGGER_AUTH = {
  bearer: 'bearer',
  refreshCookie: 'refresh-cookie',
  csrf: 'csrf',
} as const;

/**
 * Serves Swagger UI at /docs and the spec at /docs/json. Every route needs a
 * bearer access token unless it is @Public(), which clears the requirement.
 * With DEV_AUTH_TOKEN set, "Authorize" with that value to try routes out.
 */
export function setupSwagger(
  app: NestExpressApplication,
  env: EnvironmentVariables,
): void {
  const config = new DocumentBuilder()
    .setTitle(`${env.APP_NAME} API`)
    .setDescription(
      `${env.APP_NAME} social API. Sign in through GhanaWorks at ` +
        '`GET /auth/login`; the React app then gets an access token from ' +
        '`POST /auth/refresh` and sends it as `Authorization: Bearer <token>`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      SWAGGER_AUTH.bearer,
    )
    .addCookieAuth(
      REFRESH_COOKIE.name,
      { type: 'apiKey', in: 'cookie' },
      SWAGGER_AUTH.refreshCookie,
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: CSRF_HEADER },
      SWAGGER_AUTH.csrf,
    )
    .addSecurityRequirements(SWAGGER_AUTH.bearer)
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorResponseDto],
  });

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    customSiteTitle: `${env.APP_NAME} API docs`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
    },
  });
}
