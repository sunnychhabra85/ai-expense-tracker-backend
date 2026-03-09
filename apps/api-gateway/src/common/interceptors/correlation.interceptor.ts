// =============================================================
// apps/api-gateway/src/common/interceptors/correlation.interceptor.ts
// Generates x-correlation-id for request tracing across microservices
// =============================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Generate correlation ID if not present (API Gateway is the entry point)
    let correlationId = req.headers['x-correlation-id'] as string;
    
    if (!correlationId) {
      correlationId = uuidv4();
      this.logger.debug(`Generated new correlation ID: ${correlationId}`);
    } else {
      this.logger.debug(`Using existing correlation ID: ${correlationId}`);
    }

    // Attach to request object for downstream use
    req.correlationId = correlationId;
    
    // Set in request headers so proxy forwards it
    req.headers['x-correlation-id'] = correlationId;

    // Return in response for client-side tracing
    res.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}
