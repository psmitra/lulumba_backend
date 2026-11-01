import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AppLogLevel } from '../enums/log-level.enum.js';
import { redactSensitive } from '../utils/safe-object.util.js';

const LEVEL_ORDER: readonly LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export function resolveLogLevels(minimum: AppLogLevel): LogLevel[] {
  return LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(minimum) + 1);
}

/**
 * Application-wide logger.
 *
 * Wraps a dedicated ConsoleLogger (not the static `Logger`) so it can also be
 * installed as Nest's system logger via `app.useLogger()` without recursion.
 * To ship logs elsewhere later, swap the delegate or add a transport here.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly delegate: ConsoleLogger;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.delegate = new ConsoleLogger({
      logLevels: resolveLogLevels(
        configService.get('LOG_LEVEL', { infer: true }),
      ),
      json: configService.get('LOG_JSON', { infer: true }),
    });
  }

  log(message: unknown, context?: string): void {
    this.delegate.log(this.sanitize(message), ...this.withContext(context));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.delegate.error(
      this.sanitize(message),
      ...(trace === undefined ? [] : [trace]),
      ...this.withContext(context),
    );
  }

  warn(message: unknown, context?: string): void {
    this.delegate.warn(this.sanitize(message), ...this.withContext(context));
  }

  debug(message: unknown, context?: string): void {
    this.delegate.debug(this.sanitize(message), ...this.withContext(context));
  }

  verbose(message: unknown, context?: string): void {
    this.delegate.verbose(this.sanitize(message), ...this.withContext(context));
  }

  fatal(message: unknown, context?: string): void {
    this.delegate.fatal(this.sanitize(message), ...this.withContext(context));
  }

  private sanitize(message: unknown): unknown {
    return redactSensitive(message);
  }

  private withContext(context: string | undefined): string[] {
    return context === undefined ? [] : [context];
  }
}
