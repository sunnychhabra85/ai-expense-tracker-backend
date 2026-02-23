// =============================================================
// apps/processing-service/src/common/health/health.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '@finance/database';

@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok', service: 'processing-service', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    const dbOk = await this.db.isHealthy();
    return {
      status: dbOk ? 'ok' : 'error',
      service: 'processing-service',
      checks: { database: dbOk ? 'UP' : 'DOWN' },
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
