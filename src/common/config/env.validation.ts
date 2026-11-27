import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  isIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateBy,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { Environment } from '../enums/environment.enum.js';
import { AppLogLevel } from '../enums/log-level.enum.js';
import { StorageDriver } from '../enums/storage-driver.enum.js';

const URL_OPTIONS = { require_tld: false, require_protocol: true };

// The user-login scopes granted in GhanaWorks' Social app hand-off.
const DEFAULT_GHANAWORKS_SCOPES =
  'profile users.read favorites.read favorites.write';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  APP_NAME: string = 'Lulumba';

  @IsEnum(Environment)
  APP_ENV: Environment = Environment.Development;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT: number = 3000;

  // Hostname only, e.g. `localhost` or `cluster0.xxxxx.mongodb.net`.
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/:@?]+$/, {
    message: 'MONGODB_HOST must be a bare hostname (no scheme, port or path)',
  })
  MONGODB_HOST: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(65535)
  MONGODB_PORT?: number;

  // true for Atlas-style `mongodb+srv://` connections.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  MONGODB_SRV: boolean = false;

  @IsString()
  @IsNotEmpty()
  MONGODB_DATABASE: string = 'lulumba';

  @IsOptional()
  @IsString()
  MONGODB_USERNAME?: string;

  @ValidateIf((env: EnvironmentVariables) => !!env.MONGODB_USERNAME)
  @IsString()
  @IsNotEmpty({
    message: 'MONGODB_PASSWORD is required when MONGODB_USERNAME is set',
  })
  MONGODB_PASSWORD?: string;

  // Extra query string, e.g. `retryWrites=true&w=majority&authSource=admin`.
  @IsOptional()
  @IsString()
  MONGODB_OPTIONS?: string;

  // Comma-separated DNS servers for SRV lookups, e.g. `8.8.8.8,1.1.1.1`. Only
  // needed when Node's default resolver can't resolve `mongodb+srv` records.
  // Kept as a string: ConfigModule copies only string values into process.env,
  // which main.ts reads before Nest starts.
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @ValidateBy({
    name: 'isIpList',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' &&
        value.split(',').every((server) => isIP(server.trim())),
      defaultMessage: () =>
        'MONGODB_DNS_SERVERS must be a comma-separated list of IP addresses',
    },
  })
  MONGODB_DNS_SERVERS?: string;

  @IsEnum(AppLogLevel)
  LOG_LEVEL: AppLogLevel = AppLogLevel.Log;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  LOG_JSON: boolean = false;

  // ---- GhanaWorks SSO (OAuth 2.0 client) --------------------------------

  // GhanaWorks base URL, e.g. `https://ghanaworks.com`. Also the expected
  // `iss` of back-channel logout tokens.
  @IsUrl(URL_OPTIONS)
  GHANAWORKS_URL: string;

  @IsString()
  @IsNotEmpty()
  GHANAWORKS_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  GHANAWORKS_CLIENT_SECRET: string;

  // This API's /auth/callback, exactly as registered with GhanaWorks.
  @IsUrl(URL_OPTIONS)
  GHANAWORKS_REDIRECT_URI: string;

  // Space-separated scopes requested at login. `profile` is required for
  // /api/v1/auth/me; the rest are what GhanaWorks granted this client.
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== ''
      ? value.trim().split(/\s+/).join(' ')
      : DEFAULT_GHANAWORKS_SCOPES,
  )
  @Matches(/(^|\s)profile(\s|$)/, {
    message: 'GHANAWORKS_SCOPES must include profile',
  })
  GHANAWORKS_SCOPES: string = DEFAULT_GHANAWORKS_SCOPES;

  // The React app. Users land here after login; it is also the only origin
  // allowed by CORS.
  @IsUrl(URL_OPTIONS)
  FRONTEND_URL: string;

  // Browsers accept Secure cookies on http://localhost, so keep this on.
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  COOKIE_SECURE: boolean = true;

  // Number of reverse proxies in front of the API (real client IP/protocol).
  @Transform(({ value }) => (value === undefined ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS: number = 0;

  // Requests per minute per IP.
  @Transform(({ value }) => (value === undefined ? 120 : Number(value)))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 120;

  // ---- File storage ------------------------------------------------------

  // Which provider stores uploaded files. Its own settings (e.g. FTP_*) are
  // validated by that provider at startup.
  @IsEnum(StorageDriver)
  STORAGE_DRIVER: StorageDriver;

  // Upload size limits per file kind, in megabytes.
  @Transform(({ value }) => (value === undefined ? 10 : Number(value)))
  @IsInt()
  @Min(1)
  STORAGE_MAX_IMAGE_MB: number = 10;

  @Transform(({ value }) => (value === undefined ? 200 : Number(value)))
  @IsInt()
  @Min(1)
  STORAGE_MAX_VIDEO_MB: number = 200;

  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  STORAGE_MAX_DOCUMENT_MB: number = 20;

  // Total size of one user's active uploads, in megabytes.
  @Transform(({ value }) => (value === undefined ? 2048 : Number(value)))
  @IsInt()
  @Min(1)
  STORAGE_USER_QUOTA_MB: number = 2048;

  // Development only: after the GhanaWorks login, /auth/callback shows the
  // access and refresh tokens as JSON instead of redirecting to FRONTEND_URL,
  // so the API can be tested without a frontend. Refused in production.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  DEV_SHOW_TOKENS: boolean = false;
}

/**
 * Used by ConfigModule.forRoot({ validate }). Fails fast at startup with every
 * invalid variable listed, without echoing the values (they may be secrets).
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (
    validated.DEV_SHOW_TOKENS &&
    validated.APP_ENV === Environment.Production
  ) {
    throw new Error('DEV_SHOW_TOKENS must not be true when APP_ENV=production');
  }
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validated;
}

// `KEY=` in a .env file means "not set" for optional variables.
function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}
