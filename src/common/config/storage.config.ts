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
import { StorageDriver } from '../enums/storage-driver.enum.js';

/**
 * Storage settings, built from env at startup. STORAGE_DRIVER picks the
 * backend; only that backend's credentials are read and validated.
 * To add a backend: a StorageDriver value, its settings below, a case in
 * loadStorageConfig() and in common/storage/storage.factory.ts.
 */
export type StorageConfig = {
  driver: StorageDriver.Ftp;
  ftp: FtpStorageConfig;
};

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
    default:
      throw new Error(`Unsupported STORAGE_DRIVER "${String(driver)}"`);
  }
}

// ---- FTP ---------------------------------------------------------------

// Unset (or `KEY=`) variables take the default instead of becoming undefined.
const orDefault = (fallback: string) =>
  Transform(({ value }) =>
    value === undefined || value === '' ? fallback : value,
  );
const toInt = (fallback: number) =>
  Transform(({ value }) =>
    value === undefined || value === '' ? fallback : Number(value),
  );

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

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
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

// Messages name the variables, never their values.
function loadFtpConfig(read: EnvReader): FtpStorageConfig {
  const raw = Object.fromEntries(FTP_KEYS.map((key) => [key, read(key)]));
  const env = plainToInstance(FtpEnvironment, raw);
  const errors = validateSync(env);
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid FTP storage configuration: ${details}`);
  }

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
