import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';
import { MediaType } from '../types/media.types.js';
import { PostVisibility } from '../types/post.types.js';

export const MAX_POST_ATTACHMENTS = 10;

/** One media item on a post. Embedded: attachments are always read with their post. */
@Schema({ _id: false })
export class PostAttachment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Media', required: true })
  mediaId: Types.ObjectId;

  // Copied from the media document so posts can be filtered without a join.
  @Prop({ type: String, enum: Object.values(MediaType), required: true })
  mediaType: MediaType;

  @Prop({ type: Number, required: true, min: 0 })
  sortOrder: number;
}

export const PostAttachmentSchema =
  SchemaFactory.createForClass(PostAttachment);

@Schema({ collection: 'posts', timestamps: true })
export class Post {
  // External auth system's user id; there is no local users collection.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  authorId: string;

  @Prop({ type: String, trim: true, maxlength: 2200 })
  caption?: string;

  @Prop({
    type: String,
    enum: Object.values(PostVisibility),
    default: PostVisibility.Public,
  })
  visibility: PostVisibility;

  @Prop({
    type: [PostAttachmentSchema],
    required: true,
    validate: {
      validator: (value: PostAttachment[]) =>
        value.length >= 1 && value.length <= MAX_POST_ATTACHMENTS,
      message: `A post needs 1-${MAX_POST_ATTACHMENTS} attachments`,
    },
  })
  attachments: PostAttachment[];

  // Distinct attachment media types, kept in sync by the service whenever
  // attachments change. Drives the photo/video/document filters and works
  // whether or not a post may mix media types.
  @Prop({
    type: [String],
    enum: Object.values(MediaType),
    required: true,
  })
  mediaTypes: MediaType[];

  // Counters are server-maintained (atomic $inc), never client-supplied.
  @Prop({ type: Number, default: 0, min: 0 })
  likesCount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  commentsCount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  sharesCount: number;

  // Guards against duplicate posts when a client retries a create request.
  @Prop({ type: String, immutable: true, maxlength: 128 })
  idempotencyKey?: string;

  // Soft delete; reads must filter on `deletedAt: null`.
  @Prop({ type: Date })
  deletedAt?: Date;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// `_id` is the tie-breaker for cursor pagination on createdAt.
// A user's posts, and the home feed (authorId $in followed users).
PostSchema.index({ authorId: 1, createdAt: -1, _id: -1 });
// Latest feed, and the Videos / Pictures / Scripts sections.
PostSchema.index({ visibility: 1, createdAt: -1, _id: -1 });
PostSchema.index({ mediaTypes: 1, visibility: 1, createdAt: -1, _id: -1 });
// Caption search.
PostSchema.index({ caption: 'text' });
PostSchema.index(
  { authorId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
