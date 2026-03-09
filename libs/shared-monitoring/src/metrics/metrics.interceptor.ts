// =============================================================
// libs/shared-monitoring/src/metrics/metrics.interceptor.ts
// Intercept HTTP requests to record metrics
// =============================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('finance_platform_http_requests_total')
    private readonly requestCounter: Counter<string>,
    @InjectMetric('finance_platform_http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const service = process.env.SERVICE_NAME || 'unknown';
    const method = request.method;
    const route = request.route?.path || request.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          const status = response.statusCode;

          // Record metrics
          this.requestCounter.inc({
            method,
            route,
            status: status.toString(),
            service,
          });

          this.requestDuration.observe(
            {
              method,
              route,
              status: status.toString(),
              service,
            },
            duration,
          );
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          const status = error.status || 500;

          // Record error metrics
          this.requestCounter.inc({
            method,
            route,
            status: status.toString(),
            service,
          });

          this.requestDuration.observe(
            {
              method,
              route,
              status: status.toString(),
              service,
            },
            duration,
          );
        },
      }),
    );
  }
}
