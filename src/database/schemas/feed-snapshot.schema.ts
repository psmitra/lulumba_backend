import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';

/**
 * The ranked order of a feed, frozen when its first page is requested so
 * later pages never repeat or skip posts while scores keep changing. Expired
 * snapshots are removed by MongoDB's TTL monitor.
 */
@Schema({
  collection: 'feed_snapshots',
  timestamps: { createdAt: true, updatedAt: false },
})
export class FeedSnapshot {
  // External auth system's user id of the viewer.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  userId: string;

  // Which feed this order belongs to, e.g. `home` or `section:video`.
  @Prop({ type: String, required: true, immutable: true, maxlength: 64 })
  feed: string;

  @Prop({ type: [SchemaTypes.ObjectId], required: true, immutable: true })
  postIds: Types.ObjectId[];

  @Prop({ type: Date, required: true, immutable: true })
  expiresAt: Date;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const FeedSnapshotSchema = SchemaFactory.createForClass(FeedSnapshot);

// Deleted by MongoDB shortly after `expiresAt`; reads also check it.
FeedSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
