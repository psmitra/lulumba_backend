import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';

/** A post saved to the user's private Shortlist. */
@Schema({
  collection: 'bookmarks',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Bookmark {
  // External auth system's user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  userId: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    required: true,
    immutable: true,
  })
  postId: Types.ObjectId;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const BookmarkSchema = SchemaFactory.createForClass(Bookmark);

// One bookmark per user per post; also serves "is saved" checks.
BookmarkSchema.index({ userId: 1, postId: 1 }, { unique: true });
// The user's Shortlist, newest first. Type filters join to posts.mediaTypes.
BookmarkSchema.index({ userId: 1, createdAt: -1, _id: -1 });
