import type { HydratedDocument } from 'mongoose';
import type { Comment } from '../schemas/comment.schema.js';

export type CommentDocument = HydratedDocument<Comment>;
