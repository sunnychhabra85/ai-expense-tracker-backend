// =============================================================
// apps/auth-service/src/common/health/health.module.ts
// Kubernetes uses /health for liveness/readiness probes
// =============================================================

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
