import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { API_BASE_PATH } from '@common/constants/api.constants.js';
import { CSRF_HEADER, REFRESH_COOKIE } from '@modules/auth/auth.constants.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './swagger.dto.js';

export const SWAGGER_PATH = 'docs';

/** Downloadable OpenAPI spec, for Postman, Insomnia or client generators. */
export const SWAGGER_EXPORT_PATHS = {
  json: `${SWAGGER_PATH}/json`,
  yaml: `${SWAGGER_PATH}/yaml`,
} as const;

/** Security scheme names, as referenced by @ApiSecurity / @ApiCookieAuth. */
export const SWAGGER_AUTH = {
  bearer: 'bearer',
  refreshCookie: 'refresh-cookie',
  csrf: 'csrf',
} as const;

/**
 * Serves Swagger UI at /docs and the spec at /docs/json and /docs/yaml
 * (import either into Postman or a client generator). Every route needs a
 * bearer access token unless it is @Public(), which clears the requirement.
 * With DEV_SHOW_TOKENS=true, sign in at /api/v1/auth/login to see an access
 * token, then "Authorize" with it to try routes out.
 */
export function setupSwagger(
  app: NestExpressApplication,
  env: EnvironmentVariables,
): void {
  const config = new DocumentBuilder()
    .setTitle(`${env.APP_NAME} API`)
    .setDescription(
      `${env.APP_NAME} social API. Sign in through GhanaWorks at ` +
        `\`GET ${API_BASE_PATH}/auth/login\`; the React app then gets an ` +
        `access token from \`POST ${API_BASE_PATH}/auth/refresh\` and sends ` +
        'it as `Authorization: Bearer <token>`.' +
        `\n\nExport this spec: [JSON](/${SWAGGER_EXPORT_PATHS.json}) · ` +
        `[YAML](/${SWAGGER_EXPORT_PATHS.yaml})`,
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
    jsonDocumentUrl: SWAGGER_EXPORT_PATHS.json,
    yamlDocumentUrl: SWAGGER_EXPORT_PATHS.yaml,
    customSiteTitle: `${env.APP_NAME} API docs`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
    },
  });
}
