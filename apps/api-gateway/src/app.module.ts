// =============================================================
// apps/api-gateway/src/app.module.ts
// Root module for API Gateway
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { HealthModule } from './common/health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import appConfig from './common/config/app.config';

@Module({
  imports: [
    // ── Config ─────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
    }),

    // ── Rate Limiting ───────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60_000,   // 1 minute window
        limit: 100,    // Max 100 requests per minute per IP
      },
      {
        name: 'long',
        ttl: 3_600_000, // 1 hour window
        limit: 1000,    // Max 1000 requests per hour per IP
      },
    ]),

    // ── HTTP Client ─────────────────────────────────────────────
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // ── Feature Modules ─────────────────────────────────────────
    HealthModule,
    ProxyModule,
  ],
})
export class AppModule {}
