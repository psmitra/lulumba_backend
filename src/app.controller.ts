import { DatabaseService } from '@common/services/database.service.js';
import type { DatabaseHealth } from '@common/services/database.service.js';
import type { ApiResponse } from '@common/response/response.interface.js';
import { successResponse } from '@common/response/response.util.js';
import { Public } from '@modules/auth/decorators/public.decorator.js';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller()
export class AppController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Public()
  @Get('health')
  health(): ApiResponse<{ database: DatabaseHealth }> {
    const database = this.databaseService.getHealth();
    if (database.status !== 'up') {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return successResponse({ database }, 'OK');
  }
}
