import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { DatabaseModule } from '@database/database.module.js';
import { PostsModule } from '@modules/posts/posts.module.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaController } from './controller/media.controller.js';
import { MediaService } from './service/media.service.js';

const MB = 1024 * 1024;

@Module({
  imports: [
    DatabaseModule,
    PostsModule,
    // Kept in memory: StorageService needs the bytes to detect the type.
    // The cap is the largest per-kind limit; StorageService enforces each.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        storage: memoryStorage(),
        limits: {
          files: 1,
          fields: 10,
          fileSize:
            Math.max(
              config.get('STORAGE_MAX_IMAGE_MB', { infer: true }),
              config.get('STORAGE_MAX_VIDEO_MB', { infer: true }),
              config.get('STORAGE_MAX_DOCUMENT_MB', { infer: true }),
            ) * MB,
        },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
