import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth.constants.js';

/** Skips the global access-token guard for this route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
