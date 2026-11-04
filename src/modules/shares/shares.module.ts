import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import { SharesController } from './controller/shares.controller.js';
import { SharesService } from './service/shares.service.js';

@Module({
  imports: [DatabaseModule, PostsModule, ProfilesModule],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
