import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { Notification } from '@database/schemas/notification.schema.js';

export enum NotificationType {
  NewFollower = 'new_follower',
  PostLike = 'post_like',
  PostComment = 'post_comment',
  CommentReply = 'comment_reply',
}

export type NotificationDocument = HydratedDocument<Notification>;

/** What NotificationRepository returns: plain object, `id` as a string. */
export type NotificationEntity = Entity<Notification>;
