import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Follow } from '@database/schemas/follow.schema.js';

export type FollowDocument = HydratedDocument<Follow>;

/** What FollowRepository returns: plain object, `id` as a string. */
export type FollowEntity = Entity<Follow>;
