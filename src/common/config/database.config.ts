import dns from 'node:dns';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import type { EnvironmentVariables } from './env.validation.js';

export interface MongoUriParts {
  host: string;
  port?: number;
  srv: boolean;
  database: string;
  username?: string;
  password?: string;
  options?: string;
}

/**
 * Builds a MongoDB connection string from discrete settings. Credentials are
 * URL-encoded so passwords containing `@`, `:` or `/` don't break the URI.
 * Ports are not allowed in `mongodb+srv://` URIs, so `port` is ignored there.
 */
export function buildMongoUri(parts: MongoUriParts): string {
  const scheme = parts.srv ? 'mongodb+srv' : 'mongodb';

  const credentials = parts.username
    ? `${encodeURIComponent(parts.username)}:${encodeURIComponent(parts.password ?? '')}@`
    : '';

  const host =
    !parts.srv && parts.port ? `${parts.host}:${parts.port}` : parts.host;

  const query = parts.options ? `?${parts.options.replace(/^\?/, '')}` : '';

  return `${scheme}://${credentials}${host}/${parts.database}${query}`;
}

export function getMongoUri(env: EnvironmentVariables): string {
  return buildMongoUri({
    host: env.MONGODB_HOST,
    port: env.MONGODB_PORT,
    srv: env.MONGODB_SRV,
    database: env.MONGODB_DATABASE,
    username: env.MONGODB_USERNAME,
    password: env.MONGODB_PASSWORD,
    options: env.MONGODB_OPTIONS,
  });
}

/**
 * Opens the application's MongoDB connection; resolves once it is ready and
 * rejects if no server is reachable within `serverSelectionTimeoutMS`.
 */
export async function createDatabaseConnection(
  env: EnvironmentVariables,
): Promise<Connection> {
  // Must run before connecting: the driver resolves `mongodb+srv` records
  // with Node's resolver, not the OS one.
  if (env.MONGODB_DNS_SERVERS) {
    dns.setServers(
      env.MONGODB_DNS_SERVERS.split(',').map((server) => server.trim()),
    );
  }

  return mongoose
    .createConnection(getMongoUri(env), {
      appName: env.APP_NAME,
      serverSelectionTimeoutMS: 10_000,
    })
    .asPromise();
}
