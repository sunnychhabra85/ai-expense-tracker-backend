// =============================================================
// libs/shared-monitoring/src/metrics/metrics.controller.ts
// Expose /metrics endpoint for Prometheus scraping
// =============================================================

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('monitoring')
@Controller('metrics')
@SkipThrottle() // Don't rate-limit metrics scraping
export class MetricsController {
  @Get()
  @ApiExcludeEndpoint() // Hide from Swagger docs
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  getMetrics() {
    // The @willsoto/nestjs-prometheus automatically handles this
    // This controller is just to ensure the route is registered
    return 'Metrics endpoint';
  }
}
