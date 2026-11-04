import { DatabaseModule } from '@database/database.module.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import { FollowController } from './controller/follow.controller.js';
import { FollowService } from './service/follow.service.js';

@Module({
  imports: [DatabaseModule, ProfilesModule],
  controllers: [FollowController],
  providers: [FollowService],
  exports: [FollowService],
})
export class FollowModule {}
