import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '@common/config/storage.config.js';
import type { StorageProvider } from '../../interfaces/storage-provider.interface.js';
import { assertValidStorageKey } from '../../storage.errors.js';
import type { StorageResult } from '../../storage.types.js';
import { publicUrl } from '../../storage.url.js';

/** The part of S3Client this provider uses (mockable in tests). */
export type S3Sender = Pick<S3Client, 'send'>;

export type S3ClientFactory = (config: S3StorageConfig) => S3Sender;

// Keys are random UUIDs and never rewritten with other content, so caches
// may keep them forever.
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Amazon S3 or an S3-compatible server such as Garage or MinIO. A PUT is
 * atomic (readers see the old object or the whole new one), so unlike FTP
 * no temporary key is needed.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Sender;

  constructor(
    private readonly config: S3StorageConfig,
    createClient: S3ClientFactory = defaultS3Client,
  ) {
    this.client = createClient(config);
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<StorageResult> {
    assertValidStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
        ContentLength: file.length,
        CacheControl: IMMUTABLE,
      }),
    );
    return { key, url: this.getUrl(key), size: file.length, mimeType };
  }

  /** S3 DELETE already succeeds when the object is gone. */
  async delete(key: string): Promise<void> {
    assertValidStorageKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertValidStorageKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  getUrl(key: string): string | null {
    return publicUrl(this.config.publicBaseUrl, key);
  }
}

function defaultS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // S3-compatible servers (Garage, MinIO) don't all accept the newer
    // default checksum headers; send and check them only when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
  });
}

/** HEAD answers a bare 404 (`NotFound`); other calls `NoSuchKey`. */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata.httpStatusCode === 404)
  );
}
