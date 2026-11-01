import type { EnvironmentVariables } from '@common/config/env.validation.js';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CSRF_HEADER } from '../auth.constants.js';

/**
 * For routes authenticated by the refresh cookie. SameSite alone isn't enough
 * because sibling subdomains count as the same site, so the request must also
 * come from FRONTEND_URL and carry a custom header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.allowedOrigin = new URL(
      config.get('FRONTEND_URL', { infer: true }),
    ).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.headers.origin !== this.allowedOrigin ||
      request.headers[CSRF_HEADER] !== '1'
    ) {
      throw new ForbiddenException('Cross-site request blocked');
    }
    return true;
  }
}
