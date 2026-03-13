// =============================================================
// libs/shared-monitoring/src/metrics/metrics.module.ts
// Shared Prometheus metrics module for all services
// =============================================================

import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService, httpRequestsTotal, httpRequestDuration, dbQueryDuration, businessMetricsCounter } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    PrometheusModule.register({
      // Default metrics path is /metrics
      path: '/metrics',
      // Default port (will use app port)
      defaultMetrics: {
        enabled: true,
        // Collect default Node.js metrics
        config: {
          prefix: 'finance_platform_',
        },
      },
    }),
  ],
  providers: [
    MetricsService,
    httpRequestsTotal,
    httpRequestDuration,
    dbQueryDuration,
    businessMetricsCounter,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [PrometheusModule, MetricsService],
})
export class MetricsModule {}
