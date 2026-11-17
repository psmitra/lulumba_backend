import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { isAbsolute, resolve } from 'node:path';
import { StorageDriver } from '../enums/storage-driver.enum.js';

/**
 * Storage settings, built from env at startup. STORAGE_DRIVER picks the
 * backend; only that backend's credentials are read and validated.
 * To add a backend: a StorageDriver value, its settings below, a case in
 * loadStorageConfig() and in common/storage/storage.factory.ts.
 */
export type StorageConfig =
  | { driver: StorageDriver.Ftp; ftp: FtpStorageConfig }
  | { driver: StorageDriver.Local; local: LocalStorageConfig };

export interface LocalStorageConfig {
  /** Absolute directory all keys live under, normalized for this OS. */
  rootPath: string;
  /** Public URL that serves `rootPath`; no public URLs when absent. */
  publicBaseUrl?: string;
}

export interface FtpStorageConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** false = plain FTP, true = explicit FTPS (AUTH TLS), 'implicit' = implicit FTPS. */
  secure: boolean | 'implicit';
  timeoutMs: number;
  /** Absolute remote directory all keys live under, without trailing slash. */
  rootPath: string;
  /** Public URL that serves `rootPath`; no public URLs when absent. */
  publicBaseUrl?: string;
  /** Simultaneous FTP connections (each transfer uses its own). */
  maxConnections: number;
}

/** Reads one env variable (ConfigService.get in the app). */
export type EnvReader = (key: string) => unknown;

export function loadStorageConfig(read: EnvReader): StorageConfig {
  const driver = read('STORAGE_DRIVER');
  switch (driver) {
    case StorageDriver.Ftp:
      return { driver, ftp: loadFtpConfig(read) };
    case StorageDriver.Local:
      return { driver, local: loadLocalConfig(read) };
    default:
      throw new Error(`Unsupported STORAGE_DRIVER "${String(driver)}"`);
  }
}

// Unset (or `KEY=`) variables take the default instead of becoming undefined.
const orDefault = (fallback: string) =>
  Transform(({ value }) =>
    value === undefined || value === '' ? fallback : value,
  );
const toInt = (fallback: number) =>
  Transform(({ value }) =>
    value === undefined || value === '' ? fallback : Number(value),
  );
const emptyAsUndefined = () =>
  Transform(({ value }) => (value === '' ? undefined : value));
const IsPublicBaseUrl = () =>
  IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  });

/**
 * Reads `keys` into `cls` and validates them. Messages name the variables,
 * never their values, so secrets can't leak into startup errors.
 */
function readEnv<T extends object>(
  cls: new () => T,
  keys: readonly (keyof T & string)[],
  read: EnvReader,
  label: string,
  extraErrors: (env: T) => string[] = () => [],
): T {
  const raw = Object.fromEntries(keys.map((key) => [key, read(key)]));
  const env = plainToInstance(cls, raw);
  const messages = validateSync(env).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  if (messages.length === 0) {
    messages.push(...extraErrors(env));
  }
  if (messages.length > 0) {
    throw new Error(`Invalid ${label} configuration: ${messages.join('; ')}`);
  }
  return env;
}

// ---- FTP ---------------------------------------------------------------

class FtpEnvironment {
  @IsString()
  @IsNotEmpty()
  FTP_HOST: string;

  @toInt(21)
  @IsInt()
  @Min(1)
  @Max(65535)
  FTP_PORT: number = 21;

  @IsString()
  @IsNotEmpty()
  FTP_USERNAME: string;

  @IsString()
  FTP_PASSWORD: string;

  @orDefault('false')
  @IsIn(['false', 'true', 'implicit'], {
    message: 'FTP_SECURE must be false, true (explicit FTPS) or implicit',
  })
  FTP_SECURE: 'false' | 'true' | 'implicit' = 'false';

  @toInt(30_000)
  @IsInt()
  @Min(1000)
  FTP_TIMEOUT: number = 30_000;

  // Absolute path of safe segments, e.g. /lulumba or /public_html/media.
  @orDefault('/lulumba')
  @Matches(/^(\/[A-Za-z0-9][A-Za-z0-9._-]*)+\/?$/, {
    message: 'FTP_ROOT_PATH must be an absolute path such as /lulumba',
  })
  FTP_ROOT_PATH: string = '/lulumba';

  @emptyAsUndefined()
  @IsOptional()
  @IsPublicBaseUrl()
  FTP_PUBLIC_BASE_URL?: string;

  @toInt(4)
  @IsInt()
  @Min(1)
  @Max(20)
  FTP_MAX_CONNECTIONS: number = 4;
}

const FTP_KEYS: readonly (keyof FtpEnvironment)[] = [
  'FTP_HOST',
  'FTP_PORT',
  'FTP_USERNAME',
  'FTP_PASSWORD',
  'FTP_SECURE',
  'FTP_TIMEOUT',
  'FTP_ROOT_PATH',
  'FTP_PUBLIC_BASE_URL',
  'FTP_MAX_CONNECTIONS',
];

function loadFtpConfig(read: EnvReader): FtpStorageConfig {
  const env = readEnv(FtpEnvironment, FTP_KEYS, read, 'FTP storage');
  return {
    host: env.FTP_HOST,
    port: env.FTP_PORT,
    user: env.FTP_USERNAME,
    password: env.FTP_PASSWORD,
    secure:
      env.FTP_SECURE === 'implicit' ? 'implicit' : env.FTP_SECURE === 'true',
    timeoutMs: env.FTP_TIMEOUT,
    rootPath: env.FTP_ROOT_PATH.replace(/\/+$/, ''),
    publicBaseUrl: env.FTP_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
    maxConnections: env.FTP_MAX_CONNECTIONS,
  };
}

// ---- Local disk --------------------------------------------------------

class LocalEnvironment {
  // Absolute directory, e.g. D:/wamp64/www/lulumba-uploads/lulumba.
  @IsString({ message: 'LOCAL_STORAGE_PATH must be set' })
  @IsNotEmpty({ message: 'LOCAL_STORAGE_PATH must be set' })
  LOCAL_STORAGE_PATH: string;

  @emptyAsUndefined()
  @IsOptional()
  @IsPublicBaseUrl()
  LOCAL_STORAGE_PUBLIC_BASE_URL?: string;
}

const LOCAL_KEYS: readonly (keyof LocalEnvironment)[] = [
  'LOCAL_STORAGE_PATH',
  'LOCAL_STORAGE_PUBLIC_BASE_URL',
];

function loadLocalConfig(read: EnvReader): LocalStorageConfig {
  const env = readEnv(
    LocalEnvironment,
    LOCAL_KEYS,
    read,
    'local storage',
    ({ LOCAL_STORAGE_PATH: root }) =>
      isAbsolute(root) && !root.split(/[\\/]/).includes('..')
        ? []
        : ['LOCAL_STORAGE_PATH must be an absolute path without ".."'],
  );
  return {
    rootPath: resolve(env.LOCAL_STORAGE_PATH),
    publicBaseUrl: env.LOCAL_STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  };
}
