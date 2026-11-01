import { ApiNoAuth } from '@common/swagger/swagger.decorators.js';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth.constants.js';

/** Skips the global access-token guard for this route or controller. */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiNoAuth());
