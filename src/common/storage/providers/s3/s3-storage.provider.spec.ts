import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '@common/config/storage.config.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStorageKeyError } from '../../storage.errors.js';
import { S3StorageProvider } from './s3-storage.provider.js';

const config: S3StorageConfig = {
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  region: 'garage',
  bucket: 'lulumba-test',
  endpoint: 'https://s3.example.test',
  forcePathStyle: true,
  publicBaseUrl: 'https://cdn.example.test',
};

function s3Error(name: string, status: number): S3ServiceException {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode: status },
    message: name,
  });
}

describe('S3StorageProvider', () => {
  const send = vi.fn();
  let provider: S3StorageProvider;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    provider = new S3StorageProvider(config, () => ({ send }));
  });

  describe('upload', () => {
    it('puts the object with its type and an immutable cache header', async () => {
      const file = Buffer.from('hello');
      const result = await provider.upload(
        file,
        'posts/images/2026/11/a.png',
        'image/png',
      );

      expect(result).toEqual({
        key: 'posts/images/2026/11/a.png',
        url: 'https://cdn.example.test/posts/images/2026/11/a.png',
        size: 5,
        mimeType: 'image/png',
      });
      const command = send.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'lulumba-test',
        Key: 'posts/images/2026/11/a.png',
        Body: file,
        ContentType: 'image/png',
        ContentLength: 5,
        CacheControl: 'public, max-age=31536000, immutable',
      });
    });

    it('passes backend failures on', async () => {
      send.mockRejectedValue(s3Error('AccessDenied', 403));
      await expect(
        provider.upload(Buffer.from('x'), 'posts/a.png', 'image/png'),
      ).rejects.toThrow('AccessDenied');
    });

    it('rejects unsafe keys before calling S3', async () => {
      await expect(
        provider.upload(Buffer.from('x'), '../a.png', 'image/png'),
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the object', async () => {
      await provider.delete('posts/a.png');
      const command = send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'lulumba-test',
        Key: 'posts/a.png',
      });
    });

    it('succeeds when the object is already gone', async () => {
      send.mockRejectedValue(s3Error('NoSuchKey', 404));
      await expect(provider.delete('posts/a.png')).resolves.toBeUndefined();
    });

    it('passes other failures on', async () => {
      send.mockRejectedValue(s3Error('AccessDenied', 403));
      await expect(provider.delete('posts/a.png')).rejects.toThrow(
        'AccessDenied',
      );
    });
  });

  describe('exists', () => {
    it('is true when HEAD succeeds', async () => {
      expect(await provider.exists('posts/a.png')).toBe(true);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    });

    it('is false on 404', async () => {
      send.mockRejectedValue(s3Error('NotFound', 404));
      expect(await provider.exists('posts/a.png')).toBe(false);
    });

    it('passes other failures on', async () => {
      send.mockRejectedValue(s3Error('Forbidden', 403));
      await expect(provider.exists('posts/a.png')).rejects.toThrow('Forbidden');
    });
  });

  describe('getUrl', () => {
    it('is the key under the public base URL', () => {
      expect(provider.getUrl('posts/images/a.png')).toBe(
        'https://cdn.example.test/posts/images/a.png',
      );
    });

    it('is null without a public base URL', () => {
      const noUrl = new S3StorageProvider(
        { ...config, publicBaseUrl: undefined },
        () => ({ send }),
      );
      expect(noUrl.getUrl('posts/a.png')).toBeNull();
    });
  });
});
