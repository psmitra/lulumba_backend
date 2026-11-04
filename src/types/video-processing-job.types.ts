import type { Entity } from '@database/repositories/base.repository.js';
import type { HydratedDocument } from 'mongoose';
import type { VideoProcessingJob } from '@database/schemas/video-processing-job.schema.js';

export enum VideoJobType {
  Watermark = 'watermark',
}

export enum VideoJobStatus {
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export type VideoProcessingJobDocument = HydratedDocument<VideoProcessingJob>;

/** What VideoProcessingJobRepository returns: plain object, `id` as a string. */
export type VideoProcessingJobEntity = Entity<VideoProcessingJob>;
