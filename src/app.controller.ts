import { DatabaseService } from '@common/services/database.service.js';
import type { DatabaseHealth } from '@common/services/database.service.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
} from '@common/swagger/swagger.decorators.js';
import { Public } from '@modules/auth/decorators/public.decorator.js';
import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

class DatabaseHealthDto implements DatabaseHealth {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiProperty({ example: 'connected' })
  state: string;

  @ApiProperty({ example: 'lulumba' })
  database: string;
}

class HealthDto {
  @ApiProperty({ type: DatabaseHealthDto })
  database: DatabaseHealthDto;
}

// Unversioned and outside the /api prefix: GET /health.
@ApiTags('health')
@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness and database status' })
  @ApiSuccessResponse(HealthDto)
  @ApiErrorResponses(HttpStatus.SERVICE_UNAVAILABLE)
  health(): ApiResponse<HealthDto> {
    const database = this.databaseService.getHealth();
    if (database.status !== 'up') {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return successResponse({ database }, 'OK');
  }
}
