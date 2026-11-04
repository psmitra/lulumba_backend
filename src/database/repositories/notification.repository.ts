import type { NotificationEntity } from '@app-types/notification.types.js';
import { Notification } from '@database/schemas/notification.schema.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class NotificationRepository extends BaseCrudRepository<
  Notification,
  NotificationEntity
> {
  constructor(@InjectModel(Notification.name) model: Model<Notification>) {
    super(model);
  }

  countUnread(recipientId: string): Promise<number> {
    return this.count({ recipientId, isRead: false });
  }

  /** Resolves to true when the recipient's notification was found. */
  markRead(id: string, recipientId: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return Promise.resolve(false);
    }
    return this.updateOneWhere(
      { _id: id, recipientId },
      { $set: { isRead: true, readAt: new Date() } },
    );
  }

  /** Resolves to the number of notifications marked as read. */
  async markAllRead(recipientId: string): Promise<number> {
    const result = await this.model.updateMany(
      { recipientId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount;
  }

  protected toEntity(document: LeanDocument<Notification>): NotificationEntity {
    return toPlainEntity(document);
  }
}
