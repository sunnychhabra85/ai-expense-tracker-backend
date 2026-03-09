// =============================================================
// apps/auth-service/src/app.module.ts
// Root module — wires all modules together
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@finance/database';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './common/health/health.module';
import { MetricsModule } from '@finance/shared-monitoring';
import appConfig from './common/config/app.config';

@Module({
  imports: [
    // ── Config ─────────────────────────────────────────────────
    // Loads .env, validates environment variables
    ConfigModule.forRoot({
      isGlobal: true,       // Available everywhere without re-importing
      load: [appConfig],
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
    }),

    // ── Rate Limiting ───────────────────────────────────────────
    // Prevents brute-force attacks on auth endpoints
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60_000,   // 1 minute window
        limit: 10,     // Max 10 requests per minute per IP
      },
      {
        name: 'long',
        ttl: 3_600_000, // 1 hour window
        limit: 100,     // Max 100 requests per hour per IP
      },
    ]),

    // ── Database ────────────────────────────────────────────────
    DatabaseModule,

    // ── Feature Modules ─────────────────────────────────────────
    AuthModule,
    UsersModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
