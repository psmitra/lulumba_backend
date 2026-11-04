import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Profile } from '@database/schemas/profile.schema.js';

export type ProfileDocument = HydratedDocument<Profile>;

/** What ProfileRepository returns: plain object, `id` as a string. */
export type ProfileEntity = Entity<Profile>;
