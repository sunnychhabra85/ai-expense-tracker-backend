// =============================================================
// libs/shared-monitoring/src/metrics/metrics.module.ts
// Shared Prometheus metrics module for all services
// =============================================================

import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

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
      // Don't create a separate server for metrics
      pushgateway: undefined,
    }),
  ],
  controllers: [MetricsController],
  exports: [PrometheusModule],
})
export class MetricsModule {}
