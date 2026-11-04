import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Bookmark } from '@database/schemas/bookmark.schema.js';

export type BookmarkDocument = HydratedDocument<Bookmark>;

/** What BookmarkRepository returns: plain object, `id` as a string. */
export type BookmarkEntity = Entity<Bookmark>;
