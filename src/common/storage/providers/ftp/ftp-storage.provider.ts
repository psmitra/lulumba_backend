import { Client, FTPError } from 'basic-ftp';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageProvider } from '../../interfaces/storage-provider.interface.js';
import { assertValidStorageKey } from '../../storage.errors.js';
import type { StorageResult } from '../../storage.types.js';
import { publicUrl } from '../../storage.url.js';
import type { FtpStorageConfig } from '@common/config/storage.config.js';

/** The part of basic-ftp's Client this provider uses (mockable in tests). */
export type FtpClient = Pick<
  Client,
  'access' | 'ensureDir' | 'uploadFrom' | 'rename' | 'remove' | 'size' | 'close'
>;

export type FtpClientFactory = (timeoutMs: number) => FtpClient;

// 550: "Requested action not taken. File unavailable (e.g. not found)."
const FILE_UNAVAILABLE = 550;

/**
 * FTP / FTPS storage (not SFTP, which is a different, SSH-based protocol).
 *
 * A basic-ftp client runs one command at a time, so every operation gets its
 * own short-lived connection, at most FTP_MAX_CONNECTIONS at once. Uploads go
 * to a temporary name and are renamed into place, so a failed transfer never
 * leaves a partial file under the real key.
 */
export class FtpStorageProvider implements StorageProvider {
  private readonly slots: Semaphore;

  constructor(
    private readonly config: FtpStorageConfig,
    private readonly createClient: FtpClientFactory = (timeoutMs) =>
      new Client(timeoutMs),
  ) {
    this.slots = new Semaphore(config.maxConnections);
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<StorageResult> {
    const path = this.remotePath(key);
    const dir = posix.dirname(path);
    const tempPath = `${dir}/.${posix.basename(path)}.${randomUUID()}.part`;

    await this.withClient(async (client) => {
      await client.ensureDir(dir);
      try {
        await client.uploadFrom(Readable.from(file), tempPath);
        await client.rename(tempPath, path);
      } catch (error) {
        // Best effort: the connection may be the thing that failed.
        await client.remove(tempPath, true).catch(() => undefined);
        throw error;
      }
    });

    return { key, url: this.getUrl(key), size: file.length, mimeType };
  }

  async delete(key: string): Promise<void> {
    const path = this.remotePath(key);
    await this.withClient(async (client) => {
      try {
        await client.remove(path);
      } catch (error) {
        if (!isFileUnavailable(error)) throw error;
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    const path = this.remotePath(key);
    return this.withClient(async (client) => {
      try {
        await client.size(path);
        return true;
      } catch (error) {
        if (isFileUnavailable(error)) return false;
        throw error;
      }
    });
  }

  getUrl(key: string): string | null {
    return publicUrl(this.config.publicBaseUrl, key);
  }

  /** Absolute remote path, guaranteed to stay inside the root directory. */
  private remotePath(key: string): string {
    assertValidStorageKey(key);
    const path = posix.normalize(`${this.config.rootPath}/${key}`);
    if (!path.startsWith(`${this.config.rootPath}/`)) {
      throw new Error('Storage key resolves outside the root directory');
    }
    return path;
  }

  private async withClient<T>(
    work: (client: FtpClient) => Promise<T>,
  ): Promise<T> {
    const release = await this.slots.acquire();
    const client = this.createClient(this.config.timeoutMs);
    try {
      const { host, port, user, password, secure } = this.config;
      await client.access({
        host,
        port,
        user,
        password,
        secure,
        // Verify the certificate against the configured host name.
        secureOptions: secure ? { servername: host } : undefined,
      });
      return await work(client);
    } finally {
      client.close();
      release();
    }
  }
}

function isFileUnavailable(error: unknown): boolean {
  return error instanceof FTPError && error.code === FILE_UNAVAILABLE;
}

/** Limits how many operations run at once; others wait in FIFO order. */
class Semaphore {
  private readonly waiting: (() => void)[] = [];
  private available: number;

  constructor(size: number) {
    this.available = size;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return () => this.release();
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      next(); // hand the slot straight to the next waiter
    } else {
      this.available += 1;
    }
  }
}
