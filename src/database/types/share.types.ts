import type { HydratedDocument } from 'mongoose';
import type { Share } from '../schemas/share.schema.js';

export enum ShareType {
  Internal = 'internal',
  CopyLink = 'copy_link',
  External = 'external',
}

export type ShareDocument = HydratedDocument<Share>;
