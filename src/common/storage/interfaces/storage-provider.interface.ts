import type { StorageResult } from '../storage.types.js';

/**
 * What every storage backend implements. Keys are relative, validated paths
 * such as `posts/images/2026/11/<uuid>.webp`; where they live physically is
 * the provider's business.
 */
export interface StorageProvider {
  /** Stores the file under `key`, replacing any existing file. */
  upload(file: Buffer, key: string, mimeType: string): Promise<StorageResult>;

  /** Removes the file. Succeeds if it is already gone. */
  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /** Public URL of the file, or null when the backend has no public URL. */
  getUrl(key: string): string | null;
}
