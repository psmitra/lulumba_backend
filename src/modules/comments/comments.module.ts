import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import {
  CommentsController,
  PostCommentsController,
  RepliesController,
} from './controller/comments.controller.js';
import { CommentsService } from './service/comments.service.js';

@Module({
  imports: [DatabaseModule, PostsModule, ProfilesModule],
  controllers: [PostCommentsController, CommentsController, RepliesController],
  providers: [CommentsService],
})
export class CommentsModule {}
