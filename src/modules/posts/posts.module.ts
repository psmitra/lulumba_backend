import { DatabaseModule } from '@database/database.module.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import { PostsController } from './controller/posts.controller.js';
import { PostPresenter } from './service/post-presenter.service.js';
import { PostsService } from './service/posts.service.js';

@Module({
  imports: [DatabaseModule, ProfilesModule],
  controllers: [PostsController],
  providers: [PostsService, PostPresenter],
  exports: [PostsService, PostPresenter],
})
export class PostsModule {}
