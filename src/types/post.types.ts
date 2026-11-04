import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Post } from '@database/schemas/post.schema.js';

export enum PostVisibility {
  Public = 'public',
  Followers = 'followers',
}

export type PostDocument = HydratedDocument<Post>;

/** What PostRepository returns: plain object, `id` as a string. */
export type PostEntity = Entity<Post>;
