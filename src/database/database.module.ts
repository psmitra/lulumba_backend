import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlockRepository } from './repositories/block.repository.js';
import { BookmarkRepository } from './repositories/bookmark.repository.js';
import { CommentRepository } from './repositories/comment.repository.js';
import { FeedSnapshotRepository } from './repositories/feed-snapshot.repository.js';
import { FollowRepository } from './repositories/follow.repository.js';
import { LikeRepository } from './repositories/like.repository.js';
import { MediaRepository } from './repositories/media.repository.js';
import { NotificationRepository } from './repositories/notification.repository.js';
import { PostRepository } from './repositories/post.repository.js';
import { ProfileRepository } from './repositories/profile.repository.js';
import { ReportRepository } from './repositories/report.repository.js';
import { ShareRepository } from './repositories/share.repository.js';
import { VideoProcessingJobRepository } from './repositories/video-processing-job.repository.js';
import { Block, BlockSchema } from './schemas/block.schema.js';
import { Bookmark, BookmarkSchema } from './schemas/bookmark.schema.js';
import { Comment, CommentSchema } from './schemas/comment.schema.js';
import {
  FeedSnapshot,
  FeedSnapshotSchema,
} from './schemas/feed-snapshot.schema.js';
import { Follow, FollowSchema } from './schemas/follow.schema.js';
import { Like, LikeSchema } from './schemas/like.schema.js';
import { Media, MediaSchema } from './schemas/media.schema.js';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema.js';
import { Post, PostSchema } from './schemas/post.schema.js';
import { Profile, ProfileSchema } from './schemas/profile.schema.js';
import { Report, ReportSchema } from './schemas/report.schema.js';
import { Share, ShareSchema } from './schemas/share.schema.js';
import {
  VideoProcessingJob,
  VideoProcessingJobSchema,
} from './schemas/video-processing-job.schema.js';

const repositories = [
  BlockRepository,
  BookmarkRepository,
  CommentRepository,
  FeedSnapshotRepository,
  FollowRepository,
  LikeRepository,
  MediaRepository,
  NotificationRepository,
  PostRepository,
  ProfileRepository,
  ReportRepository,
  ShareRepository,
  VideoProcessingJobRepository,
];

/**
 * Every model and its repository. Feature modules import this and inject
 * repositories; they never inject Mongoose models directly.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Block.name, schema: BlockSchema },
      { name: Bookmark.name, schema: BookmarkSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: FeedSnapshot.name, schema: FeedSnapshotSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Like.name, schema: LikeSchema },
      { name: Media.name, schema: MediaSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Post.name, schema: PostSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Share.name, schema: ShareSchema },
      { name: VideoProcessingJob.name, schema: VideoProcessingJobSchema },
    ]),
  ],
  providers: repositories,
  exports: repositories,
})
export class DatabaseModule {}
