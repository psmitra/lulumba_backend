import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Error as MongooseError } from 'mongoose';
import {
  getDuplicateKeyFields,
  isDuplicateKeyError,
} from '../utils/mongo-error.util.js';
import { DuplicateKeyError } from '../exceptions/duplicate-key.error.js';
import { AppLogger } from '../logger/logger.service.js';
import type {
  ApiErrorDetail,
  ApiErrorResponse,
} from '../response/response.interface.js';
import { nowIso } from '../utils/date.util.js';

interface NormalizedError {
  statusCode: number;
  message: string;
  details?: ApiErrorDetail[];
}

/**
 * Turns every thrown error into the standard ApiErrorResponse.
 *
 * Database errors are mapped to safe client errors; anything unrecognised
 * becomes a generic 500 and is logged with its stack. Internal messages and
 * stacks are never sent to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: AppLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request: unknown = ctx.getRequest();
    const path = String(httpAdapter.getRequestUrl(request) ?? '');

    const normalized = this.normalize(exception);

    if (normalized.statusCode >= 500) {
      this.logger.error(
        `${String(httpAdapter.getRequestMethod(request))} ${path} failed: ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
        AllExceptionsFilter.name,
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      message: normalized.message,
      error: {
        statusCode: normalized.statusCode,
        code: statusCodeName(normalized.statusCode),
        ...(normalized.details ? { details: normalized.details } : {}),
        path,
        timestamp: nowIso(),
      },
    };

    httpAdapter.reply(ctx.getResponse(), body, normalized.statusCode);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }

    if (exception instanceof DuplicateKeyError) {
      return duplicateKey(exception.fields);
    }
    if (isDuplicateKeyError(exception)) {
      return duplicateKey(getDuplicateKeyFields(exception));
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        details: Object.values(exception.errors).map((error) => ({
          field: error.path,
          message: error.message,
        })),
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid value',
        details: [
          { field: exception.path, message: `Invalid ${exception.kind}` },
        ],
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}

function fromHttpException(exception: HttpException): NormalizedError {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return { statusCode, message: response };
  }

  const { message } = response as { message?: unknown };

  // ValidationPipe reports one message per failed constraint as an array.
  if (Array.isArray(message)) {
    return {
      statusCode,
      message: 'Validation failed',
      details: message.map((item) => ({ message: String(item) })),
    };
  }

  return {
    statusCode,
    message: typeof message === 'string' ? message : exception.message,
  };
}

function duplicateKey(fields: string[]): NormalizedError {
  return {
    statusCode: HttpStatus.CONFLICT,
    message: 'Resource already exists',
    details: fields.map((field) => ({
      field,
      message: `${field} is already in use`,
    })),
  };
}

function statusCodeName(statusCode: number): string {
  const name: unknown = (HttpStatus as Record<number, unknown>)[statusCode];
  return typeof name === 'string' ? name : 'ERROR';
}

function describe(exception: unknown): string {
  return exception instanceof Error
    ? `${exception.name}: ${exception.message}`
    : 'Non-error value thrown';
}
