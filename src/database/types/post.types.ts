import type { HydratedDocument } from 'mongoose';
import type { Post } from '../schemas/post.schema.js';

export enum PostVisibility {
  Public = 'public',
  Followers = 'followers',
}

export type PostDocument = HydratedDocument<Post>;
