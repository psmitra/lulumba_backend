import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiResponse,
  ApiSecurity,
  DECORATORS,
  getSchemaPath,
  type ReferenceObject,
  type SchemaObject,
} from '@nestjs/swagger';
import {
  ApiErrorResponseDto,
  CursorMetaDto,
  PaginationMetaDto,
} from './swagger.dto.js';

interface SuccessOptions {
  status?: HttpStatus;
  description?: string;
}

/** Documents `successResponse(data)`: the envelope with `data` as `model`. */
export function ApiSuccessResponse(
  model: Type<unknown>,
  { status = HttpStatus.OK, description }: SuccessOptions = {},
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: envelope({ $ref: getSchemaPath(model) }, { type: 'null' }),
    }),
  );
}

/** Documents `paginatedResponse(result)`: `data` is a page of `model`. */
export function ApiPaginatedResponse(
  model: Type<unknown>,
  { status = HttpStatus.OK, description }: SuccessOptions = {},
) {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiResponse({
      status,
      description,
      schema: envelope(
        { type: 'array', items: { $ref: getSchemaPath(model) } },
        { $ref: getSchemaPath(PaginationMetaDto) },
      ),
    }),
  );
}

/** Documents `cursorResponse(items, meta)`: a cursor page of `model`. */
export function ApiCursorPaginatedResponse(
  model: Type<unknown>,
  { status = HttpStatus.OK, description }: SuccessOptions = {},
) {
  return applyDecorators(
    ApiExtraModels(model, CursorMetaDto),
    ApiResponse({
      status,
      description,
      schema: envelope(
        { type: 'array', items: { $ref: getSchemaPath(model) } },
        { $ref: getSchemaPath(CursorMetaDto) },
      ),
    }),
  );
}

/** Documents error statuses with the AllExceptionsFilter body. */
export function ApiErrorResponses(...statuses: HttpStatus[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        type: ApiErrorResponseDto,
        example: errorExample(status),
      }),
    ),
  );
}

// Typical messages, so each status shows a fitting example in Swagger UI.
const ERROR_MESSAGES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Validation failed',
  [HttpStatus.UNAUTHORIZED]: 'Authentication required',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Resource already exists',
  [HttpStatus.GONE]: 'This feed has expired; load it again from the first page',
  [HttpStatus.TOO_MANY_REQUESTS]: 'ThrottlerException: Too Many Requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Database unavailable',
};

function errorExample(status: HttpStatus): ApiErrorResponseDto {
  return {
    success: false,
    message: ERROR_MESSAGES[status] ?? 'Request failed',
    error: {
      statusCode: status,
      code: HttpStatus[status] ?? 'ERROR',
      ...(status === HttpStatus.BAD_REQUEST
        ? { details: [{ field: 'page', message: 'page must be an integer' }] }
        : {}),
      path: '/api/v1/users/5001/follow',
      timestamp: '2026-11-01T21:47:00.009Z',
    },
  };
}

/**
 * Marks a route as needing no access token, overriding the document-wide
 * bearer requirement. `Public()` applies it, so don't use it directly. Skipped
 * when the route already declares its own scheme (e.g. the refresh cookie),
 * which needs `Public()` written above that route's @ApiSecurity.
 */
export function ApiNoAuth(): ClassDecorator & MethodDecorator {
  return (target: object, key?: string | symbol, descriptor?: object) => {
    const holder: object = descriptor
      ? (descriptor as PropertyDescriptor).value
      : target;
    if (Reflect.hasMetadata(DECORATORS.API_SECURITY, holder)) {
      return;
    }
    ApiSecurity({})(target, key as string, descriptor as PropertyDescriptor);
  };
}

function envelope(
  data: SchemaObject | ReferenceObject,
  meta: SchemaObject | ReferenceObject,
): SchemaObject {
  return {
    type: 'object',
    required: ['success', 'message', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      message: { type: 'string', example: 'Request successful' },
      data,
      meta,
    },
  };
}
