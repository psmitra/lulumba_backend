import { StorageDriver } from '@common/enums/storage-driver.enum.js';
import { describe, expect, it } from 'vitest';
import { FtpStorageProvider } from './providers/ftp/ftp-storage.provider.js';
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
});
