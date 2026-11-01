import type { EnvironmentVariables } from '@common/config/env.validation.js';
import type { AppLogger } from '@common/logger/logger.service.js';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '@common/storage/interfaces/storage-provider.interface.js';
import {
  InvalidStorageKeyError,
  StorageError,
} from '@common/storage/storage.errors.js';
import { StorageService } from './storage.service.js';
import { StorageFolder } from '@common/storage/storage.types.js';

// Minimal real file signatures; the type is detected from these bytes.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
const MP4 = Buffer.from(
  '000000186674797069736f6d0000020069736f6d69736f32',
  'hex',
);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

const limitsMb: Record<string, number> = {
  STORAGE_MAX_IMAGE_MB: 1,
  STORAGE_MAX_VIDEO_MB: 5,
  STORAGE_MAX_DOCUMENT_MB: 2,
};

describe('StorageService', () => {
  let provider: { [K in keyof StorageProvider]: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };
  let service: StorageService;

  beforeEach(() => {
    provider = {
      upload: vi.fn(async (file: Buffer, key: string, mimeType: string) => ({
        key,
        url: `https://cdn.test/${key}`,
        size: file.length,
        mimeType,
      })),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      getUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
    };
    logger = { error: vi.fn() };
    const config = { get: (key: string) => limitsMb[key] };
    service = new StorageService(
      provider as unknown as StorageProvider,
      logger as unknown as AppLogger,
      config as unknown as ConfigService<EnvironmentVariables, true>,
    );
  });

  describe('store', () => {
    it('detects the type and stores under a generated key', async () => {
      const result = await service.store(PNG, StorageFolder.PostImages);

      expect(result.mimeType).toBe('image/png');
      expect(result.key).toMatch(
        /^posts\/images\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/,
      );
      expect(provider.upload).toHaveBeenCalledWith(
        PNG,
        result.key,
        'image/png',
      );
    });

    it('generates a different key for every upload', async () => {
      const a = await service.store(JPEG, StorageFolder.ProfileAvatars);
      const b = await service.store(JPEG, StorageFolder.ProfileAvatars);
      expect(a.key).not.toBe(b.key);
    });

    it('accepts each kind only in the folders that allow it', async () => {
      await expect(
        service.store(PDF, StorageFolder.PostDocuments),
      ).resolves.toBeDefined();
      await expect(
        service.store(MP4, StorageFolder.Reels),
      ).resolves.toBeDefined();
      await expect(
        service.store(MP4, StorageFolder.Stories),
      ).resolves.toBeDefined();

      await expect(
        service.store(PDF, StorageFolder.ProfileAvatars),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      await expect(
        service.store(PNG, StorageFolder.PostVideos),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('rejects disguised and unknown files', async () => {
      await expect(
        service.store(EXE, StorageFolder.MessageAttachments),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      await expect(
        service.store(Buffer.from('just text'), StorageFolder.PostImages),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      expect(provider.upload).not.toHaveBeenCalled();
    });

    it('enforces the size limit for the detected kind', async () => {
      const tooBig = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
      await expect(
        service.store(tooBig, StorageFolder.PostImages),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });

    it('rejects an empty file', async () => {
      await expect(
        service.store(Buffer.alloc(0), StorageFolder.PostImages),
      ).rejects.toThrow('empty');
    });
  });

  describe('provider failures', () => {
    it('wraps upload failures in StorageError and logs them', async () => {
      provider.upload.mockRejectedValue(new Error('530 Login incorrect'));

      const error = await service
        .upload(PNG, 'posts/images/a.png', 'image/png')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toBe('Storage upload failed');
      expect(logger.error).toHaveBeenCalledOnce();
    });

    it('deletes, and wraps delete failures', async () => {
      await service.delete('posts/images/a.png');
      expect(provider.delete).toHaveBeenCalledWith('posts/images/a.png');

      provider.delete.mockRejectedValue(new Error('timeout'));
      await expect(service.delete('posts/images/a.png')).rejects.toBeInstanceOf(
        StorageError,
      );
    });

    it('discard never throws', async () => {
      provider.delete.mockRejectedValue(new Error('timeout'));
      await expect(
        service.discard('posts/images/a.png'),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledOnce();
    });

    it('checks existence', async () => {
      await expect(service.exists('a.png')).resolves.toBe(true);
      provider.exists.mockResolvedValue(false);
      await expect(service.exists('a.png')).resolves.toBe(false);
    });
  });

  it.each(['../secret', '/abs.png', 'a//b.png', ''])(
    'rejects invalid key %j without calling the provider',
    async (key) => {
      await expect(
        service.upload(PNG, key, 'image/png'),
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(service.delete(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      expect(() => service.getUrl(key)).toThrow(InvalidStorageKeyError);
      expect(provider.upload).not.toHaveBeenCalled();
      expect(provider.delete).not.toHaveBeenCalled();
    },
  );
});
