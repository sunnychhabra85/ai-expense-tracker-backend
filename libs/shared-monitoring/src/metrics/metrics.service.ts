// =============================================================
// libs/shared-monitoring/src/metrics/metrics.service.ts
// Service for creating custom business metrics
// =============================================================

import { Injectable } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

// Custom metric providers
export const httpRequestsTotal = makeCounterProvider({
  name: 'finance_platform_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service'] as const,
});

export const httpRequestDuration = makeHistogramProvider({
  name: 'finance_platform_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const dbQueryDuration = makeHistogramProvider({
  name: 'finance_platform_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'service'] as const,
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
});

export const activeConnections = makeGaugeProvider({
  name: 'finance_platform_active_connections',
  help: 'Number of active connections',
  labelNames: ['service', 'type'] as const,
});

export const businessMetricsCounter = makeCounterProvider({
  name: 'finance_platform_business_events_total',
  help: 'Total business events',
  labelNames: ['event_type', 'service', 'status'] as const,
});

@Injectable()
export class MetricsService {
  // Helper methods for common metric operations
  
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    service: string,
    duration?: number,
  ) {
    // This will be implemented by injecting the actual metrics
  }

  recordDbQuery(
    operation: string,
    table: string,
    service: string,
    duration: number,
  ) {
    // This will be implemented by injecting the actual metrics
  }

  recordBusinessEvent(
    eventType: string,
    service: string,
    status: 'success' | 'error',
  ) {
    // This will be implemented by injecting the actual metrics
  }
}
