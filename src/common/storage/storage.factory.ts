import type { StorageConfig } from '@common/config/storage.config.js';
import { StorageDriver } from '@common/enums/storage-driver.enum.js';
import type { StorageProvider } from './interfaces/storage-provider.interface.js';
import { FtpStorageProvider } from './providers/ftp/ftp-storage.provider.js';
import { LocalStorageProvider } from './providers/local/local-storage.provider.js';
import { S3StorageProvider } from './providers/s3/s3-storage.provider.js';

/** Builds the provider selected by the storage config. */
export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.driver) {
    case StorageDriver.Ftp:
      return new FtpStorageProvider(config.ftp);
    case StorageDriver.Local:
      return new LocalStorageProvider(config.local);
    case StorageDriver.S3:
      return new S3StorageProvider(config.s3);
  }
}
