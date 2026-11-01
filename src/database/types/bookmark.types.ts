import type { HydratedDocument } from 'mongoose';
import type { Bookmark } from '../schemas/bookmark.schema.js';

export type BookmarkDocument = HydratedDocument<Bookmark>;
