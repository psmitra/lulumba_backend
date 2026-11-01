import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';
import { NotificationType } from '../types/notification.types.js';

/**
 * In-app notification for `recipientId` about something `actorId` did. Both
 * are external auth system user ids; the service never notifies users about
 * their own actions.
 */
@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ type: String, required: true, immutable: true, trim: true })
  recipientId: string;

  @Prop({ type: String, required: true, immutable: true, trim: true })
  actorId: string;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    required: true,
    immutable: true,
  })
  type: NotificationType;

  // Set for like, comment and reply notifications.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Post', immutable: true })
  postId?: Types.ObjectId;

  // Set for comment and reply notifications.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Comment', immutable: true })
  commentId?: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isRead: boolean;

  @Prop({ type: Date })
  readAt?: Date;

  // Built by the service for events that must notify only once, e.g.
  // `post_like:<postId>:<actorId>`, so like/unlike/like doesn't spam.
  @Prop({ type: String, immutable: true })
  dedupeKey?: string;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Notification list, newest first.
NotificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 });
// Unread count, unread-only list and mark-all-as-read.
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index(
  { recipientId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  },
);
