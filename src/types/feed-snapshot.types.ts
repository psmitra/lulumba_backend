import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { FeedSnapshot } from '@database/schemas/feed-snapshot.schema.js';

export type FeedSnapshotDocument = HydratedDocument<FeedSnapshot>;

/** What FeedSnapshotRepository returns: plain object, `id` as a string. */
export type FeedSnapshotEntity = Entity<FeedSnapshot>;
