import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';

/**
 * Comments and replies share this collection. A top-level comment has
 * `parentId: null`; a reply points at its comment. Replies are one level deep:
 * the service rejects a reply whose parent is itself a reply.
 */
@Schema({ collection: 'comments', timestamps: true })
export class Comment {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Post',
    required: true,
    immutable: true,
  })
  postId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Comment',
    default: null,
    immutable: true,
  })
  parentId: Types.ObjectId | null;

  // External auth system's user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  authorId: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000,
  })
  body: string;

  // Top-level comments only; server-maintained (atomic $inc).
  @Prop({ type: Number, default: 0, min: 0 })
  repliesCount: number;

  // Soft delete; a deleted comment with replies can be shown as "[deleted]".
  @Prop({ type: Date })
  deletedAt?: Date;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// A post's top-level comments (parentId: null), oldest or newest first.
CommentSchema.index({ postId: 1, parentId: 1, createdAt: 1, _id: 1 });
// Replies to a comment, chronological.
CommentSchema.index({ parentId: 1, createdAt: 1, _id: 1 });
