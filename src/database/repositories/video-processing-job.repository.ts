import type { VideoProcessingJobEntity } from '@app-types/video-processing-job.types.js';
import { VideoJobStatus } from '@app-types/video-processing-job.types.js';
import { VideoProcessingJob } from '@database/schemas/video-processing-job.schema.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  BaseCrudRepository,
  toPlainEntity,
  type LeanDocument,
} from './base.repository.js';

const ACTIVE = [VideoJobStatus.Queued, VideoJobStatus.Processing];

@Injectable()
export class VideoProcessingJobRepository extends BaseCrudRepository<
  VideoProcessingJob,
  VideoProcessingJobEntity
> {
  constructor(
    @InjectModel(VideoProcessingJob.name) model: Model<VideoProcessingJob>,
  ) {
    super(model);
  }

  /** The queued or running job for an equivalent request, if any. */
  findActiveByDedupeKey(
    dedupeKey: string,
  ): Promise<VideoProcessingJobEntity | null> {
    return this.findOne({ dedupeKey, status: { $in: ACTIVE } });
  }

  /**
   * Atomically moves the oldest queued job to Processing for a worker.
   * Two workers can never claim the same job.
   */
  claimNextQueued(): Promise<VideoProcessingJobEntity | null> {
    return this.findOneAndUpdateWhere(
      { status: VideoJobStatus.Queued },
      {
        $set: { status: VideoJobStatus.Processing, startedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 } },
    );
  }

  markCompleted(id: string, outputMediaId: string): Promise<boolean> {
    return this.updateOneWhere(
      { _id: id, status: VideoJobStatus.Processing },
      {
        $set: {
          status: VideoJobStatus.Completed,
          outputMediaId: new Types.ObjectId(outputMediaId),
          completedAt: new Date(),
        },
      },
    );
  }

  markFailed(id: string, failureCode: string): Promise<boolean> {
    return this.updateOneWhere(
      { _id: id, status: VideoJobStatus.Processing },
      {
        $set: {
          status: VideoJobStatus.Failed,
          failureCode,
          completedAt: new Date(),
        },
      },
    );
  }

  protected toEntity(
    document: LeanDocument<VideoProcessingJob>,
  ): VideoProcessingJobEntity {
    return toPlainEntity(document);
  }
}
