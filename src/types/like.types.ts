import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Like } from '@database/schemas/like.schema.js';

export type LikeDocument = HydratedDocument<Like>;

/** What LikeRepository returns: plain object, `id` as a string. */
export type LikeEntity = Entity<Like>;
