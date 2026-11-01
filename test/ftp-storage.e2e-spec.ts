import { loadStorageConfig } from '@common/config/storage.config.js';
import type { StorageProvider } from '@common/storage/interfaces/storage-provider.interface.js';
import { createStorageProvider } from '@common/storage/storage.factory.js';
import { randomUUID } from 'node:crypto';

/**
 * Optional: runs against a real FTP server only when FTP_TEST_HOST is set,
 * e.g.
 *   FTP_TEST_HOST=ftp.example.com FTP_TEST_USERNAME=u FTP_TEST_PASSWORD=p \
 *   FTP_TEST_SECURE=true FTP_TEST_ROOT_PATH=/lulumba-test npm run test:e2e
 * Use a throwaway directory: the test creates and deletes files under it.
 */
const host = process.env.FTP_TEST_HOST;

describe.skipIf(!host)('FTP storage against a real server', () => {
  const key = `integration/${randomUUID()}.txt`;
  let provider: StorageProvider;

  // Not at collection time: the suite body runs even when skipped.
  beforeAll(() => {
    provider = createStorageProvider(
      loadStorageConfig((name) =>
        name === 'STORAGE_DRIVER'
          ? 'ftp'
          : process.env[name.replace(/^FTP_/, 'FTP_TEST_')],
      ),
    );
  });

  it('uploads, finds and deletes a file', async () => {
    const file = Buffer.from('lulumba storage integration test');

    const result = await provider.upload(file, key, 'text/plain');
    expect(result.size).toBe(file.length);
    expect(await provider.exists(key)).toBe(true);

    await provider.delete(key);
    expect(await provider.exists(key)).toBe(false);
    // Deleting again is a no-op.
    await provider.delete(key);
  });

  it('handles concurrent uploads', async () => {
    const keys = Array.from(
      { length: 6 },
      (_, i) => `integration/${randomUUID()}-${i}.txt`,
    );
    await Promise.all(
      keys.map((k) => provider.upload(Buffer.from(k), k, 'text/plain')),
    );
    const found = await Promise.all(keys.map((k) => provider.exists(k)));
    expect(found.every(Boolean)).toBe(true);
    await Promise.all(keys.map((k) => provider.delete(k)));
  });
});
