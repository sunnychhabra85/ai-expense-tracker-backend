// =============================================================
// apps/upload-service/src/common/filters/http-exception.filter.ts
// Returns a consistent error envelope across all endpoints.
// Without this, NestJS returns different shapes for different errors.
// =============================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message || exception.message
        : 'Internal server error';

    // Log all 5xx errors (4xx are user errors, not worth alarming on)
    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          type: 'unhandled_exception',
          correlationId: req.correlationId,
          path: req.url,
          method: req.method,
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    // Consistent response envelope — same shape as auth-service
    res.status(status).json({
      success: false,
      error: Array.isArray(message) ? message.join(', ') : message,
      statusCode: status,
      path: req.url,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
