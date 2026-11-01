import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * One-way follow: `followerId` follows `followingId`. Both are external auth
 * system user ids. The service rejects self-follows and blocked users.
 */
@Schema({
  collection: 'follows',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Follow {
  @Prop({ type: String, required: true, immutable: true, trim: true })
  followerId: string;

  @Prop({ type: String, required: true, immutable: true, trim: true })
  followingId: string;

  // Maintained by `timestamps`; declared for typing only.
  createdAt: Date;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

// One relationship per pair; also serves follow-status checks.
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
// Following list (and home-feed author ids), newest first.
FollowSchema.index({ followerId: 1, createdAt: -1 });
// Followers list and follower count.
FollowSchema.index({ followingId: 1, createdAt: -1 });
