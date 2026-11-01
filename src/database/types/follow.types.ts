import type { HydratedDocument } from 'mongoose';
import type { Follow } from '../schemas/follow.schema.js';

export type FollowDocument = HydratedDocument<Follow>;
