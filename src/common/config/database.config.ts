import dns from 'node:dns';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import type { EnvironmentVariables } from './env.validation.js';

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
    .createConnection(env.MONGODB_URI, {
      appName: env.APP_NAME,
      serverSelectionTimeoutMS: 10_000,
    })
    .asPromise();
}
