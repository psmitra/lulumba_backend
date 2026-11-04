import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../auth.constants.js';
import type { AuthenticatedRequest } from '../interfaces/auth-context.interface.js';
import { AuthService } from '../service/auth.service.js';

/** Global guard: every route needs a Bearer token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (\S+)$/.exec(
      request.headers.authorization ?? '',
    )?.[1];
    if (!token && this.isOptional(context)) {
      return true;
    }
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    request.auth = await this.auth.authenticate(token);
    return true;
  }

  private isOptional(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
