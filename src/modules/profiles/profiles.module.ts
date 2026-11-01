import { Profile, ProfileSchema } from '@database/schemas/profile.schema.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProfilesService } from './service/profiles.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Profile.name, schema: ProfileSchema }]),
  ],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
