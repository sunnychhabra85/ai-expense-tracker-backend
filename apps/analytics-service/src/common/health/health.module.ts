// =============================================================
// apps/analytics-service/src/common/health/health.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '@finance/database';
import { CacheService } from '../../analytics/cache.service';
import { AnalyticsModule } from '../../analytics/analytics.module';

@Controller('health')
class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok', service: 'analytics-service', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    const dbOk = await this.db.isHealthy();
    return {
      status: dbOk ? 'ok' : 'error',
      service: 'analytics-service',
      checks: { database: dbOk ? 'UP' : 'DOWN' },
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  imports: [AnalyticsModule],
  controllers: [HealthController],
})
export class HealthModule {}
