import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { Module } from '@nestjs/common';
import { FeedController } from './controller/feed.controller.js';
import { FeedRanker } from './service/feed-ranker.service.js';
import { FeedService } from './service/feed.service.js';

@Module({
  imports: [DatabaseModule, PostsModule],
  controllers: [FeedController],
  providers: [FeedService, FeedRanker],
})
export class FeedModule {}
