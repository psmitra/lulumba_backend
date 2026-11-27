import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StorageDriver } from '../enums/storage-driver.enum.js';
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
const loadFtp = (values: Record<string, string>) => {
  const config = loadStorageConfig(reader(values));
  if (config.driver !== StorageDriver.Ftp) throw new Error('not FTP');
  return config.ftp;
};

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
      loadStorageConfig(reader({ ...ftpEnv, STORAGE_DRIVER: 'sftp' })),
    ).toThrow('Unsupported STORAGE_DRIVER "sftp"');
  });

  it('rejects an unsupported driver at env validation already', () => {
    expect(() => validateEnv({ STORAGE_DRIVER: 'sftp' })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it('parses FTPS modes, root path and public URL', () => {
    const ftp = loadFtp({
      ...ftpEnv,
      FTP_SECURE: 'implicit',
      FTP_PORT: '990',
      FTP_ROOT_PATH: '/public_html/media/',
      FTP_PUBLIC_BASE_URL: 'https://cdn.example.test/media/',
    });
    expect(ftp).toMatchObject({
      secure: 'implicit',
      port: 990,
      rootPath: '/public_html/media',
      publicBaseUrl: 'https://cdn.example.test/media',
    });
    expect(loadFtp({ ...ftpEnv, FTP_SECURE: 'true' }).secure).toBe(true);
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

  describe('local driver', () => {
    const root = resolve('uploads-test-root');

    it('normalizes the root path and public URL', () => {
      expect(
        loadStorageConfig(
          reader({
            STORAGE_DRIVER: 'local',
            LOCAL_STORAGE_PATH: `${root}/`,
            LOCAL_STORAGE_PUBLIC_BASE_URL: 'http://localhost/uploads/',
          }),
        ),
      ).toEqual({
        driver: 'local',
        local: { rootPath: root, publicBaseUrl: 'http://localhost/uploads' },
      });
    });

    it('needs no FTP settings and no public URL', () => {
      const config = loadStorageConfig(
        reader({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_PATH: root }),
      );
      expect(config).toEqual({
        driver: 'local',
        local: { rootPath: root, publicBaseUrl: undefined },
      });
    });

    it.each([
      [{}, 'LOCAL_STORAGE_PATH must be set'],
      [{ LOCAL_STORAGE_PATH: 'relative/uploads' }, 'absolute path'],
      [{ LOCAL_STORAGE_PATH: `${root}/../etc` }, 'absolute path'],
      [
        {
          LOCAL_STORAGE_PATH: root,
          LOCAL_STORAGE_PUBLIC_BASE_URL: 'ftp://files.example.test',
        },
        'LOCAL_STORAGE_PUBLIC_BASE_URL',
      ],
    ])('rejects invalid local config %j', (override, message) => {
      expect(() =>
        loadStorageConfig(reader({ STORAGE_DRIVER: 'local', ...override })),
      ).toThrow(message);
    });
  });

  describe('s3', () => {
    const s3Env: Record<string, string> = {
      STORAGE_DRIVER: 's3',
      AWS_ACCESS_KEY_ID: 'GKtest',
      AWS_SECRET_ACCESS_KEY: 's3-secret',
      AWS_BUCKET: 'lulumba-local',
    };

    it('selects S3 and applies defaults', () => {
      expect(loadStorageConfig(reader(s3Env))).toEqual({
        driver: 's3',
        s3: {
          accessKeyId: 'GKtest',
          secretAccessKey: 's3-secret',
          region: 'us-east-1',
          bucket: 'lulumba-local',
          endpoint: undefined,
          forcePathStyle: false,
          publicBaseUrl: undefined,
        },
      });
    });

    it('reads an S3-compatible server (Garage) and trims trailing slashes', () => {
      const config = loadStorageConfig(
        reader({
          ...s3Env,
          AWS_DEFAULT_REGION: 'garage',
          AWS_ENDPOINT: 'https://s3.example.test/',
          AWS_USE_PATH_STYLE_ENDPOINT: 'true',
          AWS_URL: 'https://files.example.test/',
        }),
      );
      expect(config).toMatchObject({
        s3: {
          region: 'garage',
          endpoint: 'https://s3.example.test',
          forcePathStyle: true,
          publicBaseUrl: 'https://files.example.test',
        },
      });
    });

    it.each([
      [{ AWS_ACCESS_KEY_ID: '' }, 'AWS_ACCESS_KEY_ID must be set'],
      [{ AWS_SECRET_ACCESS_KEY: '' }, 'AWS_SECRET_ACCESS_KEY must be set'],
      [{ AWS_BUCKET: 'Bad_Bucket' }, 'AWS_BUCKET'],
      [{ AWS_ENDPOINT: 'not a url' }, 'AWS_ENDPOINT'],
      [{ AWS_USE_PATH_STYLE_ENDPOINT: 'yes' }, 'AWS_USE_PATH_STYLE_ENDPOINT'],
      [{ AWS_URL: 'ftp://files.example.test' }, 'AWS_URL'],
    ])('rejects invalid S3 config %j', (override, message) => {
      expect(() =>
        loadStorageConfig(reader({ ...s3Env, ...override })),
      ).toThrow(message);
    });

    it('never puts the secret key in the error', () => {
      const load = () =>
        loadStorageConfig(reader({ ...s3Env, AWS_BUCKET: '' }));
      expect(load).toThrow('Invalid S3 storage configuration');
      expect(load).not.toThrow('s3-secret');
    });
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
