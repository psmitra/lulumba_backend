import { SWAGGER_AUTH } from '@common/swagger/swagger.setup.js';
import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { IS_OPTIONAL_AUTH_KEY } from '../auth.constants.js';
import type {
  AuthContext,
  AuthenticatedRequest,
} from '../interfaces/auth-context.interface.js';

/**
 * The route works signed in or out. A valid bearer token sets the caller; an
 * invalid one is still rejected, so clients notice expired tokens.
 */
export const OptionalAuth = () =>
  applyDecorators(
    SetMetadata(IS_OPTIONAL_AUTH_KEY, true),
    // Either a bearer token or nothing.
    ApiSecurity(SWAGGER_AUTH.bearer),
    ApiSecurity({}),
  );

/** The caller on an @OptionalAuth() route, or undefined when signed out. */
export const OptionalCurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
