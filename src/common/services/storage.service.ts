import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { AppLogger } from '@common/logger/logger.service.js';
import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import type { StorageProvider } from '@common/storage/interfaces/storage-provider.interface.js';
import { STORAGE_PROVIDER } from '@common/storage/storage.constants.js';
import {
  assertValidStorageKey,
  StorageError,
} from '@common/storage/storage.errors.js';
import {
  ALLOWED_MIME_TYPES,
  FileKind,
  FOLDER_KINDS,
  StorageFolder,
} from '@common/storage/storage.types.js';
import type { StorageResult } from '@common/storage/storage.types.js';

const MB = 1024 * 1024;

/**
 * The one entry point for file storage. Business modules use this, never a
 * provider or a storage client directly. Only keys and URLs belong in
 * MongoDB; file contents live in the storage backend.
 */
@Injectable()
export class StorageService {
  private readonly maxBytes: Record<FileKind, number>;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    private readonly logger: AppLogger,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.maxBytes = {
      [FileKind.Image]:
        config.get('STORAGE_MAX_IMAGE_MB', { infer: true }) * MB,
      [FileKind.Video]:
        config.get('STORAGE_MAX_VIDEO_MB', { infer: true }) * MB,
      [FileKind.Document]:
        config.get('STORAGE_MAX_DOCUMENT_MB', { infer: true }) * MB,
    };
  }

  /**
   * Stores a user upload. The type is detected from the file's bytes (the
   * client's MIME type and file name are ignored), checked against what the
   * folder accepts and the size limit, and given an unguessable key.
   */
  async store(file: Buffer, folder: StorageFolder): Promise<StorageResult> {
    if (file.length === 0) {
      throw new BadRequestException('The file is empty');
    }

    const detected = await fileTypeFromBuffer(file);
    const kind = detected && kindOf(detected.mime);
    if (!detected || !kind || !FOLDER_KINDS[folder].includes(kind)) {
      throw new UnsupportedMediaTypeException(
        'This file type is not allowed here',
      );
    }
    if (file.length > this.maxBytes[kind]) {
      throw new PayloadTooLargeException(
        `The ${kind} is larger than ${this.maxBytes[kind] / MB} MB`,
      );
    }

    return this.upload(file, generateKey(folder, detected.ext), detected.mime);
  }

  /**
   * Stores a file under an explicit key. For server-generated files (e.g.
   * thumbnails or transcodes) whose type is already known; user uploads
   * should go through store().
   */
  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<StorageResult> {
    assertValidStorageKey(key);
    return this.run('upload', key, () =>
      this.provider.upload(file, key, mimeType),
    );
  }

  /** Deletes a file. Succeeds if it no longer exists. */
  async delete(key: string): Promise<void> {
    assertValidStorageKey(key);
    await this.run('delete', key, () => this.provider.delete(key));
  }

  /**
   * Cleanup that must not fail the caller, e.g. removing a just-uploaded
   * file after saving its database record failed. Errors are logged.
   */
  async discard(key: string): Promise<void> {
    try {
      await this.delete(key);
    } catch {
      // Already logged by run(); an orphaned file is harmless.
    }
  }

  async exists(key: string): Promise<boolean> {
    assertValidStorageKey(key);
    return this.run('exists', key, () => this.provider.exists(key));
  }

  /** Public URL, or null when the backend has no public URL configured. */
  getUrl(key: string): string | null {
    assertValidStorageKey(key);
    return this.provider.getUrl(key);
  }

  // Same failure shape for every provider; provider details stay in logs.
  private async run<T>(
    operation: string,
    key: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.logger.error(
        `Storage ${operation} failed for "${key}": ${(error as Error).message}`,
        undefined,
        StorageService.name,
      );
      throw new StorageError(`Storage ${operation} failed`, { cause: error });
    }
  }
}

function kindOf(mimeType: string): FileKind | undefined {
  return Object.values(FileKind).find((kind) =>
    ALLOWED_MIME_TYPES[kind].has(mimeType),
  );
}

/** `<folder>/<yyyy>/<mm>/<uuid>.<ext>`: predictable layout, unguessable name. */
function generateKey(folder: StorageFolder, extension: string): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${folder}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension}`;
}
