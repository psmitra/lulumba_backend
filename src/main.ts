import { createDatabaseConnection } from '@common/config/database.config.js';
import { validateEnv } from '@common/config/env.validation.js';
import { Environment } from '@common/enums/environment.enum.js';
import { AppLogger } from '@common/logger/logger.service.js';
import {
  SWAGGER_EXPORT_PATHS,
  SWAGGER_PATH,
} from '@common/swagger/swagger.setup.js';
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
  const url = `http://localhost:${env.APP_PORT}`;
  logger.log(`${env.APP_NAME} listening on ${url}`, 'Bootstrap');
  if (env.APP_ENV !== Environment.Production) {
    logger.log(`Swagger docs at ${url}/${SWAGGER_PATH}`, 'Bootstrap');
    logger.log(
      `OpenAPI export: ${url}/${SWAGGER_EXPORT_PATHS.json} | ${url}/${SWAGGER_EXPORT_PATHS.yaml}`,
      'Bootstrap',
    );
  }
}
await bootstrap();
