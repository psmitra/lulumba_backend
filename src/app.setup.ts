import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_PREFIX_EXCLUDE,
} from '@common/constants/api.constants.js';
import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { Environment } from '@common/enums/environment.enum.js';
import { setupSwagger } from '@common/swagger/swagger.setup.js';
import { CSRF_HEADER } from '@modules/auth/auth.constants.js';
import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * HTTP setup shared by main.ts and the e2e tests, so tests run with the same
 * CORS, cookie and security behaviour as production.
 */
export function configureApp(
  app: NestExpressApplication,
  env: EnvironmentVariables,
): void {
  const production = env.APP_ENV === Environment.Production;

  // Routes become /api/v1/...; a controller or handler can opt into another
  // version with @Version('2'). Must run before Swagger reads the routes.
  app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_DEFAULT_VERSION,
  });

  // Behind a load balancer: real client IP (rate limits) and protocol.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  if (production) {
    app.use(requireHttps);
  }

  // Swagger UI needs inline assets, so its CSP is relaxed outside production.
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
  app.use(cookieParser());

  // Exact origin, never a wildcard: credentials (cookies) are allowed.
  app.enableCors({
    origin: [new URL(env.FRONTEND_URL).origin],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', CSRF_HEADER],
  });

  if (!production) {
    setupSwagger(app, env);
  }
}

function requireHttps(req: Request, res: Response, next: NextFunction): void {
  if (req.secure) {
    next();
    return;
  }
  res.status(403).json({ success: false, message: 'HTTPS is required' });
}
