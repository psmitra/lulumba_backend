import type { BlockEntity } from '@app-types/block.types.js';
import { Block } from '@database/schemas/block.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

@Injectable()
export class BlockRepository extends BaseCrudRepository<Block, BlockEntity> {
  constructor(@InjectModel(Block.name) model: Model<Block>) {
    super(model);
  }

  findPair(blockerId: string, blockedId: string): Promise<BlockEntity | null> {
    return this.findOne({ blockerId, blockedId });
  }

  /** Resolves to true when a block was removed. */
  deletePair(blockerId: string, blockedId: string): Promise<boolean> {
    return this.deleteOne({ blockerId, blockedId });
  }

  /** True when either user has blocked the other. */
  isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    return this.exists({
      $or: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    });
  }

  /** Users hidden from `userId`: those they blocked and those who blocked them. */
  async findHiddenUserIds(userId: string): Promise<string[]> {
    const blocks = await this.findProjected<
      Pick<Block, 'blockerId' | 'blockedId'>
    >(
      { $or: [{ blockerId: userId }, { blockedId: userId }] },
      { blockerId: 1, blockedId: 1 },
    );
    return blocks.map((block) =>
      block.blockerId === userId ? block.blockedId : block.blockerId,
    );
  }

  protected toEntity(document: LeanDocument<Block>): BlockEntity {
    return toPlainEntity(document);
  }
}
