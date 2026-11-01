import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';
import { loadStorageConfig } from './storage.config.js';

const ftpEnv: Record<string, string> = {
  STORAGE_DRIVER: 'ftp',
  FTP_HOST: 'ftp.example.test',
  FTP_USERNAME: 'lulumba',
  FTP_PASSWORD: 'secret',
};
const reader =
  (values: Record<string, string>) =>
  (key: string): unknown =>
    values[key];

describe('loadStorageConfig', () => {
  it('selects FTP and applies safe defaults', () => {
    expect(loadStorageConfig(reader(ftpEnv))).toEqual({
      driver: 'ftp',
      ftp: {
        host: 'ftp.example.test',
        port: 21,
        user: 'lulumba',
        password: 'secret',
        secure: false,
        timeoutMs: 30_000,
        rootPath: '/lulumba',
        publicBaseUrl: undefined,
        maxConnections: 4,
      },
    });
  });

  it('fails for an unsupported driver', () => {
    expect(() =>
      loadStorageConfig(reader({ ...ftpEnv, STORAGE_DRIVER: 's3' })),
    ).toThrow('Unsupported STORAGE_DRIVER "s3"');
  });

  it('rejects an unsupported driver at env validation already', () => {
    expect(() => validateEnv({ STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it('parses FTPS modes, root path and public URL', () => {
    const { ftp } = loadStorageConfig(
      reader({
        ...ftpEnv,
        FTP_SECURE: 'implicit',
        FTP_PORT: '990',
        FTP_ROOT_PATH: '/public_html/media/',
        FTP_PUBLIC_BASE_URL: 'https://cdn.example.test/media/',
      }),
    );
    expect(ftp).toMatchObject({
      secure: 'implicit',
      port: 990,
      rootPath: '/public_html/media',
      publicBaseUrl: 'https://cdn.example.test/media',
    });
    expect(
      loadStorageConfig(reader({ ...ftpEnv, FTP_SECURE: 'true' })).ftp.secure,
    ).toBe(true);
  });

  it.each([
    [{ FTP_HOST: '' }, 'FTP_HOST'],
    [{ FTP_USERNAME: '' }, 'FTP_USERNAME'],
    [{ FTP_PORT: '70000' }, 'FTP_PORT'],
    [{ FTP_SECURE: 'sftp' }, 'FTP_SECURE'],
    [{ FTP_ROOT_PATH: 'relative/path' }, 'FTP_ROOT_PATH'],
    [{ FTP_ROOT_PATH: '/lulumba/../etc' }, 'FTP_ROOT_PATH'],
    [
      { FTP_PUBLIC_BASE_URL: 'ftp://files.example.test' },
      'FTP_PUBLIC_BASE_URL',
    ],
  ])('rejects invalid FTP config %j', (override, variable) => {
    expect(() => loadStorageConfig(reader({ ...ftpEnv, ...override }))).toThrow(
      variable,
    );
  });

  it('never puts secret values in the error', () => {
    const load = () =>
      loadStorageConfig(
        reader({
          STORAGE_DRIVER: 'ftp',
          FTP_PASSWORD: 'super-secret',
          FTP_PORT: 'nope',
        }),
      );
    expect(load).toThrow('Invalid FTP storage configuration');
    expect(load).not.toThrow('super-secret');
  });
});
