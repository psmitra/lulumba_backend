import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation-only mirrors of the interfaces in response.interface.ts.
// Interfaces vanish at runtime, so Swagger needs classes to describe them.

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 57 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class ApiErrorDetailDto {
  @ApiPropertyOptional({ example: 'username' })
  field?: string;

  @ApiProperty({ example: 'username must be a string' })
  message: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'BAD_REQUEST' })
  code: string;

  @ApiPropertyOptional({ type: [ApiErrorDetailDto] })
  details?: ApiErrorDetailDto[];

  @ApiProperty({ example: '/auth/me' })
  path: string;

  @ApiProperty({ format: 'date-time' })
  timestamp: string;
}

/** Shape of every error, as written by AllExceptionsFilter. */
export class ApiErrorResponseDto {
  @ApiProperty({ enum: [false] })
  success: false;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;
}
