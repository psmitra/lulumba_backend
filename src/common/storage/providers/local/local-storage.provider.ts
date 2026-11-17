import type { LocalStorageConfig } from '@common/config/storage.config.js';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { StorageProvider } from '../../interfaces/storage-provider.interface.js';
import { assertValidStorageKey } from '../../storage.errors.js';
import type { StorageResult } from '../../storage.types.js';
import { publicUrl } from '../../storage.url.js';

/**
 * Files in a directory on this machine (LOCAL_STORAGE_PATH). Meant for
 * development and single-server setups: with several API instances, each
 * would only see its own disk. Uploads are written to a temporary name and
 * renamed into place, so a failed write never leaves a partial file under
 * the real key.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly rootPrefix: string;

  constructor(private readonly config: LocalStorageConfig) {
    this.rootPrefix = config.rootPath.endsWith(sep)
      ? config.rootPath
      : config.rootPath + sep;
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<StorageResult> {
    const path = this.filePath(key);
    const dir = dirname(path);
    const tempPath = join(dir, `.${basename(path)}.${randomUUID()}.part`);

    await mkdir(dir, { recursive: true });
    try {
      await writeFile(tempPath, file, { flag: 'wx' });
      await rename(tempPath, path);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return { key, url: this.getUrl(key), size: file.length, mimeType };
  }

  async delete(key: string): Promise<void> {
    // force: succeeds when the file is already gone.
    await rm(this.filePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.filePath(key))).isFile();
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  getUrl(key: string): string | null {
    return publicUrl(this.config.publicBaseUrl, key);
  }

  /** Absolute file path, guaranteed to stay inside the root directory. */
  private filePath(key: string): string {
    assertValidStorageKey(key);
    const path = resolve(this.config.rootPath, ...key.split('/'));
    if (!path.startsWith(this.rootPrefix)) {
      throw new Error('Storage key resolves outside the root directory');
    }
    return path;
  }
}

function isNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
