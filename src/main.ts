import { createDatabaseConnection } from '@common/config/database.config.js';
import { validateEnv } from '@common/config/env.validation.js';
import { AppLogger } from '@common/logger/logger.service.js';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // ConfigModule.forRoot() (evaluated when app.module is imported) loads .env
  // into process.env; wait for it before reading settings outside Nest.
  await ConfigModule.envVariablesLoaded;
  const env = validateEnv(process.env);

  const connection = await createDatabaseConnection(env);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(connection),
    {
      instrument: ObserveInstrument,
      bufferLogs: true,
    },
  );
  const logger = app.get(AppLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  configureApp(app, env);

  logger.log(`Connected to MongoDB database "${connection.name}"`, 'Bootstrap');

  await app.listen(env.APP_PORT);
  logger.log(`${env.APP_NAME} listening on port ${env.APP_PORT}`, 'Bootstrap');
}
await bootstrap();
