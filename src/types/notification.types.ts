import type { HydratedDocument } from 'mongoose';
import type { Notification } from '../schemas/notification.schema.js';

export enum NotificationType {
  NewFollower = 'new_follower',
  PostLike = 'post_like',
  PostComment = 'post_comment',
  CommentReply = 'comment_reply',
}

export type NotificationDocument = HydratedDocument<Notification>;
