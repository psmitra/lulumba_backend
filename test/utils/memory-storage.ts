import type { StorageProvider } from '@common/storage/interfaces/storage-provider.interface.js';
import type { StorageResult } from '@common/storage/storage.types.js';

/** Storage backend for e2e tests: files live in a Map. */
export class MemoryStorageProvider implements StorageProvider {
  readonly files = new Map<string, { file: Buffer; mimeType: string }>();
  /** Set to make every call fail, like an unreachable FTP server. */
  failing = false;

  upload(file: Buffer, key: string, mimeType: string): Promise<StorageResult> {
    this.check();
    this.files.set(key, { file, mimeType });
    return Promise.resolve({
      key,
      url: this.getUrl(key),
      size: file.length,
      mimeType,
    });
  }

  delete(key: string): Promise<void> {
    this.check();
    this.files.delete(key);
    return Promise.resolve();
  }

  exists(key: string): Promise<boolean> {
    this.check();
    return Promise.resolve(this.files.has(key));
  }

  getUrl(key: string): string {
    return `https://cdn.example.test/media/${key}`;
  }

  private check(): void {
    if (this.failing) {
      throw new Error('530 Login incorrect (internal provider detail)');
    }
  }
}
