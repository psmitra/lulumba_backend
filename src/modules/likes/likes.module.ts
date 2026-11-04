import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import { LikesController } from './controller/likes.controller.js';
import { LikesService } from './service/likes.service.js';

@Module({
  imports: [DatabaseModule, PostsModule, ProfilesModule],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
