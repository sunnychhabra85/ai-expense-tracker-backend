// =============================================================
// apps/upload-service/src/common/interceptors/correlation.interceptor.ts
// Attaches x-correlation-id to every request.
// This ID flows through all services so you can trace a
// single user request across the entire microservice ecosystem.
// =============================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Use existing correlation ID from upstream (API Gateway passes it)
    // or generate a new one if this is the originating request
    const correlationId =
      (req.headers['x-correlation-id'] as string) || uuidv4();

    // Attach to request so services can read it
    req.correlationId = correlationId;

    // Echo it back in response headers for client-side tracing
    res.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}

// =============================================================
// apps/upload-service/src/common/interceptors/logging.interceptor.ts
// Logs every request with method, path, status, duration, correlationId
// CloudWatch picks these up as structured JSON logs
// =============================================================


@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, correlationId } = req;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const duration = Date.now() - startTime;
          this.logger.log(
            JSON.stringify({
              type: 'http_request',
              method,
              url,
              statusCode: res.statusCode,
              durationMs: duration,
              correlationId,
            }),
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            JSON.stringify({
              type: 'http_error',
              method,
              url,
              statusCode: err.status || 500,
              durationMs: duration,
              correlationId,
              error: err.message,
            }),
          );
        },
      }),
    );
  }
}
