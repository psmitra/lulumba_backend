import { validateEnv } from '@common/config/env.validation.js';
import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter.js';
import { LoggerModule } from '@common/logger/logger.module.js';
import { createValidationPipe } from '@common/pipes/validation.pipe.js';
import { DatabaseService } from '@common/services/database.service.js';
import { StorageModule } from '@common/storage/storage.module.js';
import { AuthModule } from '@modules/auth/auth.module.js';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard.js';
import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { getConnectionToken } from '@nestjs/mongoose';
import { createObserveModule } from '@nestjs/observe';
import type { Connection } from 'mongoose';
import { AppController } from './app.controller.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'lulumba',
    }),
    LoggerModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [
        { ttl: 60_000, limit: config.get('THROTTLE_LIMIT', { infer: true }) },
      ],
    }),
    StorageModule,
    AuthModule,
    ProfilesModule,
  ],
  controllers: [AppController],
  providers: [
    // Registered as providers (not in main.ts) so they also apply in e2e tests.
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in this order: rate limit first, then authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
})
export class AppModule {
  /**
   * Binds the MongoDB connection opened in main.ts to the default Mongoose
   * connection token, so `MongooseModule.forFeature()`, `@InjectModel()` and
   * `@InjectConnection()` all resolve to it.
   */
  static forRoot(connection: Connection): DynamicModule {
    const connectionProvider = {
      provide: getConnectionToken(),
      useValue: connection,
    };

    return {
      module: AppModule,
      global: true,
      providers: [connectionProvider, DatabaseService],
      exports: [connectionProvider, DatabaseService],
    };
  }
}
