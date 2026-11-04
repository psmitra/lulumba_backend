import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Share } from '@database/schemas/share.schema.js';

export enum ShareType {
  Internal = 'internal',
  CopyLink = 'copy_link',
  External = 'external',
}

export type ShareDocument = HydratedDocument<Share>;

/** What ShareRepository returns: plain object, `id` as a string. */
export type ShareEntity = Entity<Share>;
