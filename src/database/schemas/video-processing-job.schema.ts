import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Types } from 'mongoose';
import {
  VideoJobStatus,
  VideoJobType,
} from '@app-types/video-processing-job.types.js';

@Schema({ _id: false })
export class WatermarkOptions {
  @Prop({ type: String, default: 'default', trim: true, maxlength: 64 })
  watermarkProfile: string;

  @Prop({ type: Boolean, default: true })
  includeCreatorUsername: boolean;
}

export const WatermarkOptionsSchema =
  SchemaFactory.createForClass(WatermarkOptions);

/**
 * Background FFmpeg job that produces a derived video (e.g. watermarked)
 * from an original upload. The original is never modified; the result is a
 * new `media` document referenced by `outputMediaId`.
 */
@Schema({ collection: 'video_processing_jobs', timestamps: true })
export class VideoProcessingJob {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Media',
    required: true,
    immutable: true,
  })
  sourceMediaId: Types.ObjectId;

  // External auth system's user id.
  @Prop({ type: String, required: true, immutable: true, trim: true })
  requesterId: string;

  @Prop({
    type: String,
    enum: Object.values(VideoJobType),
    required: true,
    immutable: true,
  })
  jobType: VideoJobType;

  @Prop({ type: WatermarkOptionsSchema, default: () => ({}), immutable: true })
  options: WatermarkOptions;

  @Prop({
    type: String,
    enum: Object.values(VideoJobStatus),
    default: VideoJobStatus.Queued,
  })
  status: VideoJobStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Media' })
  outputMediaId?: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  attempts: number;

  // Stable code for clients; details go to logs, not here.
  @Prop({ type: String, maxlength: 64 })
  failureCode?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // Identifies equivalent jobs (source + type + options), built by the service.
  @Prop({ type: String, required: true, immutable: true })
  dedupeKey: string;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const VideoProcessingJobSchema =
  SchemaFactory.createForClass(VideoProcessingJob);

// At most one active job per equivalent request.
VideoProcessingJobSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [VideoJobStatus.Queued, VideoJobStatus.Processing] },
    },
  },
);
// Find a completed derivative to download.
VideoProcessingJobSchema.index({ sourceMediaId: 1, jobType: 1, status: 1 });
// Worker pick-up and stuck-job sweeps.
VideoProcessingJobSchema.index({ status: 1, createdAt: 1 });
