import type { ShareEntity } from '@app-types/share.types.js';
import { Share } from '@database/schemas/share.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class ShareRepository extends BaseCrudRepository<Share, ShareEntity> {
  constructor(@InjectModel(Share.name) model: Model<Share>) {
    super(model);
  }

  /** Posts the user shared since `since`, once per share (feed affinity). */
  async findRecentPostIdsBy(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<string[]> {
    const shares = await this.findProjected<Pick<Share, 'postId'>>(
      { userId, createdAt: { $gte: since } },
      { postId: 1 },
      { sort: { createdAt: -1 }, limit },
    );
    return shares.map((share) => share.postId.toString());
  }

  protected toEntity(document: LeanDocument<Share>): ShareEntity {
    return toPlainEntity(document);
  }
}
