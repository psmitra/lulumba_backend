import { FTPError } from 'basic-ftp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { InvalidStorageKeyError } from '../../storage.errors.js';
import type { FtpStorageConfig } from '@common/config/storage.config.js';
import { FtpStorageProvider } from './ftp-storage.provider.js';
import type { FtpClient } from './ftp-storage.provider.js';

const config: FtpStorageConfig = {
  host: 'ftp.example.test',
  port: 21,
  user: 'lulumba',
  password: 'secret',
  secure: true,
  timeoutMs: 30_000,
  rootPath: '/lulumba',
  publicBaseUrl: 'https://cdn.example.test/media',
  maxConnections: 2,
};

const notFound = () => new FTPError({ code: 550, message: '550 Not found' });

type MockFtpClient = Record<keyof FtpClient, Mock>;

function fakeClient(): MockFtpClient {
  return {
    access: vi.fn().mockResolvedValue({ code: 230, message: 'ok' }),
    ensureDir: vi.fn().mockResolvedValue(undefined),
    uploadFrom: vi.fn().mockResolvedValue({ code: 226, message: 'ok' }),
    rename: vi.fn().mockResolvedValue({ code: 250, message: 'ok' }),
    remove: vi.fn().mockResolvedValue({ code: 250, message: 'ok' }),
    size: vi.fn().mockResolvedValue(10),
    close: vi.fn(),
  };
}

const asClient = (mock: MockFtpClient) => mock as unknown as FtpClient;

describe('FtpStorageProvider', () => {
  let client: MockFtpClient;
  let provider: FtpStorageProvider;

  beforeEach(() => {
    client = fakeClient();
    provider = new FtpStorageProvider(config, () => asClient(client));
  });

  describe('upload', () => {
    it('uploads to a temp name inside the root, then renames into place', async () => {
      const file = Buffer.from('hello');
      const result = await provider.upload(
        file,
        'posts/images/a.png',
        'image/png',
      );

      expect(client.access).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'ftp.example.test', secure: true }),
      );
      expect(client.ensureDir).toHaveBeenCalledWith('/lulumba/posts/images');
      const tempPath = client.uploadFrom.mock.calls[0][1] as string;
      expect(tempPath).toMatch(
        /^\/lulumba\/posts\/images\/\.a\.png\..+\.part$/,
      );
      expect(client.rename).toHaveBeenCalledWith(
        tempPath,
        '/lulumba/posts/images/a.png',
      );
      expect(client.close).toHaveBeenCalledOnce();
      expect(result).toEqual({
        key: 'posts/images/a.png',
        url: 'https://cdn.example.test/media/posts/images/a.png',
        size: 5,
        mimeType: 'image/png',
      });
    });

    it('removes the temp file and closes the connection when the transfer fails', async () => {
      client.uploadFrom.mockRejectedValue(new Error('connection reset'));

      await expect(
        provider.upload(Buffer.from('x'), 'posts/images/a.png', 'image/png'),
      ).rejects.toThrow('connection reset');

      const tempPath = client.uploadFrom.mock.calls[0][1] as string;
      expect(client.remove).toHaveBeenCalledWith(tempPath, true);
      expect(client.rename).not.toHaveBeenCalled();
      expect(client.close).toHaveBeenCalledOnce();
    });

    it('closes the connection when login fails', async () => {
      client.access.mockRejectedValue(new Error('530 Login incorrect'));

      await expect(
        provider.upload(Buffer.from('x'), 'a.png', 'image/png'),
      ).rejects.toThrow('530');
      expect(client.close).toHaveBeenCalledOnce();
    });

    it('limits simultaneous connections and completes every upload', async () => {
      let open = 0;
      let maxOpen = 0;
      const clients: MockFtpClient[] = [];
      provider = new FtpStorageProvider(config, () => {
        const c = fakeClient();
        c.access.mockImplementation(async () => {
          open += 1;
          maxOpen = Math.max(maxOpen, open);
          await new Promise((resolve) => setTimeout(resolve, 5));
        });
        c.close.mockImplementation(() => {
          open -= 1;
        });
        clients.push(c);
        return asClient(c);
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          provider.upload(
            Buffer.from('x'),
            `posts/images/${i}.png`,
            'image/png',
          ),
        ),
      );

      expect(results.map((r) => r.key)).toHaveLength(10);
      expect(maxOpen).toBe(config.maxConnections);
      expect(clients.every((c) => c.close.mock.calls.length === 1)).toBe(true);
      // Temp names never collide between concurrent uploads.
      const temps = clients.map((c) => c.uploadFrom.mock.calls[0][1]);
      expect(new Set(temps).size).toBe(10);
    });
  });

  describe('delete', () => {
    it('removes the file', async () => {
      await provider.delete('posts/images/a.png');
      expect(client.remove).toHaveBeenCalledWith('/lulumba/posts/images/a.png');
      expect(client.close).toHaveBeenCalledOnce();
    });

    it('treats a missing file as deleted', async () => {
      client.remove.mockRejectedValue(notFound());
      await expect(provider.delete('a.png')).resolves.toBeUndefined();
    });

    it('rethrows other failures', async () => {
      client.remove.mockRejectedValue(new Error('timeout'));
      await expect(provider.delete('a.png')).rejects.toThrow('timeout');
      expect(client.close).toHaveBeenCalledOnce();
    });
  });

  describe('exists', () => {
    it('is true when the server reports a size', async () => {
      await expect(provider.exists('a.png')).resolves.toBe(true);
      expect(client.size).toHaveBeenCalledWith('/lulumba/a.png');
    });

    it('is false on 550', async () => {
      client.size.mockRejectedValue(notFound());
      await expect(provider.exists('a.png')).resolves.toBe(false);
    });

    it('rethrows other failures', async () => {
      client.size.mockRejectedValue(new Error('timeout'));
      await expect(provider.exists('a.png')).rejects.toThrow('timeout');
    });
  });

  describe('keys and URLs', () => {
    it.each([
      '../etc/passwd',
      'posts/../../etc/passwd',
      '/absolute/path.png',
      'posts//double.png',
      'posts\\windows.png',
      '.hidden',
      '',
    ])('rejects unsafe key %j before connecting', async (key) => {
      await expect(
        provider.upload(Buffer.from('x'), key, 'image/png'),
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(provider.delete(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      expect(client.access).not.toHaveBeenCalled();
    });

    it('returns no URL when no public base URL is configured', async () => {
      provider = new FtpStorageProvider(
        { ...config, publicBaseUrl: undefined },
        () => asClient(client),
      );
      expect(provider.getUrl('posts/images/a.png')).toBeNull();
      const result = await provider.upload(
        Buffer.from('x'),
        'a.png',
        'image/png',
      );
      expect(result.url).toBeNull();
    });
  });
});
