import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';

@Schema({
  collection: 'likes',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Like {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    required: true,
    immutable: true,
  })
  postId: Types.ObjectId;

  // External auth system's user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  userId: string;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const LikeSchema = SchemaFactory.createForClass(Like);

// One like per user per post; also serves "is liked" checks.
LikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
// Users who liked a post, newest first.
LikeSchema.index({ postId: 1, createdAt: -1, _id: -1 });
// A user's recent likes (feed affinity).
LikeSchema.index({ userId: 1, createdAt: -1 });
