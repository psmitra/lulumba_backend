import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { Module } from '@nestjs/common';
import {
  BookmarksController,
  ShortlistController,
} from './controller/bookmarks.controller.js';
import { BookmarksService } from './service/bookmarks.service.js';

@Module({
  imports: [DatabaseModule, PostsModule],
  controllers: [BookmarksController, ShortlistController],
  providers: [BookmarksService],
})
export class BookmarksModule {}
