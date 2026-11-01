import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
// Default import: ConnectionStates is not exposed as a named ESM export by
// mongoose's CommonJS build, so `import { ConnectionStates }` fails at runtime.
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';

const { ConnectionStates } = mongoose;

export interface DatabaseHealth {
  status: 'up' | 'down';
  state: string;
  database: string;
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  // The connection is opened in main.ts, outside Nest, so Nest won't close it.
  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }

  getHealth(): DatabaseHealth {
    const readyState = this.connection.readyState;
    return {
      status: readyState === ConnectionStates.connected ? 'up' : 'down',
      state: ConnectionStates[readyState] ?? 'unknown',
      database: this.connection.name,
    };
  }

  /**
   * Runs `work` in a transaction; commits on success, aborts on throw, and
   * retries on transient errors. Pass the session to every repository call
   * inside `work` via `{ session }`.
   *
   * Requires MongoDB running as a replica set or sharded cluster - standalone
   * servers reject transactions.
   */
  withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.connection.transaction(work);
  }
}
