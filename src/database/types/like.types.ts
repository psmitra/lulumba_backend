import type { HydratedDocument } from 'mongoose';
import type { Like } from '../schemas/like.schema.js';

export type LikeDocument = HydratedDocument<Like>;
