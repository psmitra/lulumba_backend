import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';
import { MediaStatus, MediaType, MediaVariant } from '../types/media.types.js';

/**
 * An uploaded image, video or document, kept independent of posts so it can
 * be uploaded first and attached afterwards. The storage provider sits behind
 * an adapter; `storageKey` and `storageProvider` are internal and must never
 * be returned to clients - expose short-lived signed URLs instead.
 */
@Schema({ collection: 'media', timestamps: true })
export class Media {
  // External auth system's user id; there is no local users collection.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  ownerId: string;

  @Prop({
    type: String,
    enum: Object.values(MediaType),
    required: true,
    immutable: true,
  })
  mediaType: MediaType;

  @Prop({
    type: String,
    enum: Object.values(MediaStatus),
    default: MediaStatus.Pending,
  })
  status: MediaStatus;

  @Prop({
    type: String,
    enum: Object.values(MediaVariant),
    default: MediaVariant.Original,
    immutable: true,
  })
  variant: MediaVariant;

  // Set on derived files (e.g. a watermarked copy) to the original upload.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Media', immutable: true })
  sourceMediaId?: Types.ObjectId;

  // Client-supplied file name, kept for display and download names only.
  @Prop({ type: String, required: true, trim: true, maxlength: 255 })
  fileName: string;

  // Detected from the file signature, not the client-supplied content type.
  @Prop({ type: String, required: true, trim: true, maxlength: 127 })
  mimeType: string;

  // Bytes.
  @Prop({ type: Number, required: true, min: 0 })
  size: number;

  @Prop({ type: String, required: true, immutable: true })
  storageProvider: string;

  @Prop({ type: String, required: true, unique: true, immutable: true })
  storageKey: string;

  @Prop({ type: String })
  thumbnailKey?: string;

  @Prop({ type: String })
  checksum?: string;

  // Images and videos.
  @Prop({ type: Number, min: 0 })
  width?: number;

  @Prop({ type: Number, min: 0 })
  height?: number;

  // Videos only.
  @Prop({ type: Number, min: 0 })
  durationSeconds?: number;

  // Safe, user-facing message; never a raw provider error.
  @Prop({ type: String, maxlength: 500 })
  failureReason?: string;

  // Soft delete; the stored object is removed later by a cleanup job.
  @Prop({ type: Date })
  deletedAt?: Date;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);

// "My uploads", newest first.
MediaSchema.index({ ownerId: 1, mediaType: 1, createdAt: -1 });
// Find derivatives of an original (e.g. its watermarked copy).
MediaSchema.index({ sourceMediaId: 1, variant: 1 }, { sparse: true });
// Cleanup of abandoned or failed uploads.
MediaSchema.index({ status: 1, createdAt: 1 });
