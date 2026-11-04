import type { HydratedDocument } from 'mongoose';
import type { VideoProcessingJob } from '../schemas/video-processing-job.schema.js';

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
