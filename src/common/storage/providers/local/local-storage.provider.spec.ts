import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidStorageKeyError } from '../../storage.errors.js';
import { LocalStorageProvider } from './local-storage.provider.js';

describe('LocalStorageProvider', () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lulumba-storage-'));
    provider = new LocalStorageProvider({
      rootPath: root,
      publicBaseUrl: 'http://localhost/uploads',
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('writes the file under the root, creating directories', async () => {
      const result = await provider.upload(
        Buffer.from('hello'),
        'posts/images/2026/11/a.png',
        'image/png',
      );

      expect(result).toEqual({
        key: 'posts/images/2026/11/a.png',
        url: 'http://localhost/uploads/posts/images/2026/11/a.png',
        size: 5,
        mimeType: 'image/png',
      });
      const path = join(root, 'posts', 'images', '2026', '11', 'a.png');
      expect(await readFile(path, 'utf8')).toBe('hello');
    });

    it('leaves no temporary files behind', async () => {
      await provider.upload(Buffer.from('x'), 'posts/a.png', 'image/png');
      expect(await readdir(join(root, 'posts'))).toEqual(['a.png']);
    });

    it('replaces an existing file', async () => {
      await provider.upload(Buffer.from('old'), 'posts/a.png', 'image/png');
      await provider.upload(Buffer.from('new'), 'posts/a.png', 'image/png');
      expect(await readFile(join(root, 'posts', 'a.png'), 'utf8')).toBe('new');
    });
  });

  describe('delete', () => {
    it('removes the file', async () => {
      await provider.upload(Buffer.from('x'), 'posts/a.png', 'image/png');
      await provider.delete('posts/a.png');
      expect(await provider.exists('posts/a.png')).toBe(false);
    });

    it('succeeds when the file is already gone', async () => {
      await expect(provider.delete('posts/missing.png')).resolves.toBe(
        undefined,
      );
    });
  });

  describe('exists', () => {
    it('is true for a stored file and false otherwise', async () => {
      await provider.upload(Buffer.from('x'), 'posts/a.png', 'image/png');
      expect(await provider.exists('posts/a.png')).toBe(true);
      expect(await provider.exists('posts/b.png')).toBe(false);
      expect(await provider.exists('nowhere/at/all.png')).toBe(false);
    });

    it('is false for a directory', async () => {
      await provider.upload(Buffer.from('x'), 'posts/a.png', 'image/png');
      expect(await provider.exists('posts')).toBe(false);
    });

    it('is false when a parent path is a file', async () => {
      await writeFile(join(root, 'file'), 'x');
      expect(await provider.exists('file/child.png')).toBe(false);
    });
  });

  describe('getUrl', () => {
    it('joins the public base URL and the key', () => {
      expect(provider.getUrl('posts/images/a.png')).toBe(
        'http://localhost/uploads/posts/images/a.png',
      );
    });

    it('is null without a public base URL', () => {
      const noUrl = new LocalStorageProvider({ rootPath: root });
      expect(noUrl.getUrl('posts/a.png')).toBeNull();
    });
  });

  it.each(['../escape.png', 'posts/../../escape.png', '/abs.png', 'a\\b.png'])(
    'rejects the unsafe key %s before touching the disk',
    async (key) => {
      await expect(
        provider.upload(Buffer.from('x'), key, 'image/png'),
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(provider.delete(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      await expect(provider.exists(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
    },
  );
});
