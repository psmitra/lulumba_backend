import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * `blockerId` blocked `blockedId` (external auth system user ids). The
 * service rejects self-blocks.
 */
@Schema({
  collection: 'blocks',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Block {
  @Prop({ type: String, required: true, immutable: true, trim: true })
  blockerId: string;

  @Prop({ type: String, required: true, immutable: true, trim: true })
  blockedId: string;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const BlockSchema = SchemaFactory.createForClass(Block);

// One block per pair; also serves "did A block B" checks.
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
// The user's block list, newest first.
BlockSchema.index({ blockerId: 1, createdAt: -1 });
// "Who blocked me", for hiding content in both directions.
BlockSchema.index({ blockedId: 1 });
