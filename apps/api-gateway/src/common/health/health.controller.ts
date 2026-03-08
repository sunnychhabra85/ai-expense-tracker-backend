// =============================================================
// apps/api-gateway/src/common/health/health.controller.ts
// =============================================================

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => Promise.resolve({ gateway: { status: 'up' } }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    const services = this.configService.get('services');
    
    return this.health.check([
      () => Promise.resolve({ gateway: { status: 'up' } }),
      // Optional: Check if downstream services are healthy
      // () => this.http.pingCheck('auth-service', `${services.auth}/api/v1/health`),
    ]);
  }
}
