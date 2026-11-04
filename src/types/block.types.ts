import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Block } from '@database/schemas/block.schema.js';

export type BlockDocument = HydratedDocument<Block>;

/** What BlockRepository returns: plain object, `id` as a string. */
export type BlockEntity = Entity<Block>;
