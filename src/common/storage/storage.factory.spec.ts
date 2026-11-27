import { StorageDriver } from '@common/enums/storage-driver.enum.js';
import { describe, expect, it } from 'vitest';
import { FtpStorageProvider } from './providers/ftp/ftp-storage.provider.js';
import { LocalStorageProvider } from './providers/local/local-storage.provider.js';
import { S3StorageProvider } from './providers/s3/s3-storage.provider.js';
import { createStorageProvider } from './storage.factory.js';

describe('createStorageProvider', () => {
  it('builds the FTP provider for the ftp driver', () => {
    const provider = createStorageProvider({
      driver: StorageDriver.Ftp,
      ftp: {
        host: 'ftp.example.test',
        port: 21,
        user: 'lulumba',
        password: 'secret',
        secure: false,
        timeoutMs: 30_000,
        rootPath: '/lulumba',
        maxConnections: 4,
      },
    });
    expect(provider).toBeInstanceOf(FtpStorageProvider);
  });

  it('builds the local provider for the local driver', () => {
    const provider = createStorageProvider({
      driver: StorageDriver.Local,
      local: { rootPath: '/var/lulumba' },
    });
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('builds the S3 provider for the s3 driver', () => {
    const provider = createStorageProvider({
      driver: StorageDriver.S3,
      s3: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        region: 'garage',
        bucket: 'lulumba-test',
        endpoint: 'https://s3.example.test',
        forcePathStyle: true,
      },
    });
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });
});
