import { loadStorageConfig } from '@common/config/storage.config.js';
import { StorageService } from '@common/services/storage.service.js';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.constants.js';
import { createStorageProvider } from './storage.factory.js';

/** Global: any module can inject StorageService without importing this. */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      // Reads STORAGE_DRIVER + that driver's credentials; fails startup if invalid.
      useFactory: (config: ConfigService) =>
        createStorageProvider(loadStorageConfig((key) => config.get(key))),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
