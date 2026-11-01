import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';
import { ShareType } from '../types/share.types.js';

/**
 * A recorded share action. `recipientUserId` is required for internal shares
 * and absent otherwise (enforced by the service).
 */
@Schema({
  collection: 'shares',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Share {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    required: true,
    immutable: true,
  })
  postId: Types.ObjectId;

  // External auth system's user id of the person sharing.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  userId: string;

  @Prop({
    type: String,
    enum: Object.values(ShareType),
    required: true,
    immutable: true,
  })
  shareType: ShareType;

  @Prop({ type: String, immutable: true, trim: true })
  recipientUserId?: string;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const ShareSchema = SchemaFactory.createForClass(Share);

ShareSchema.index({ postId: 1, createdAt: -1 });
// Posts shared with a user in-app.
ShareSchema.index(
  { recipientUserId: 1, createdAt: -1 },
  { partialFilterExpression: { recipientUserId: { $type: 'string' } } },
);
