import { DatabaseModule } from '@database/database.module.js';
import { Module } from '@nestjs/common';
import { ProfilesService } from './service/profiles.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
