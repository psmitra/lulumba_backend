import type { HydratedDocument } from 'mongoose';
import type { Media } from '../schemas/media.schema.js';

export enum MediaType {
  Image = 'image',
  Video = 'video',
  Document = 'document',
}

export enum MediaStatus {
  Pending = 'pending',
  Uploaded = 'uploaded',
  Processing = 'processing',
  Ready = 'ready',
  Failed = 'failed',
}

/** An original upload, or a file generated from one (e.g. a watermarked copy). */
export enum MediaVariant {
  Original = 'original',
  Watermarked = 'watermarked',
}

export type MediaDocument = HydratedDocument<Media>;
