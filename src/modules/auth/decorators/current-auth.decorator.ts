import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthContext,
  AuthenticatedRequest,
} from '../interfaces/auth-context.interface.js';

/** The verified caller set by JwtAuthGuard. Only valid on non-public routes. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return request.auth;
  },
);
