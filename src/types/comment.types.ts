import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Comment } from '@database/schemas/comment.schema.js';

export type CommentDocument = HydratedDocument<Comment>;

/** What CommentRepository returns: plain object, `id` as a string. */
export type CommentEntity = Entity<Comment>;
