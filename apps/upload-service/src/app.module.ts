// =============================================================
// apps/upload-service/src/app.module.ts
// Root module for Upload Service
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './common/health/health.module';
import uploadConfig from './common/config/upload.config';

@Module({
  imports: [
    // ── Config ─────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [uploadConfig],
    }),

    // ── Rate Limiting ───────────────────────────────────────────
    // Upload endpoints are more restrictive — 5 uploads per hour per user
    ThrottlerModule.forRoot([
      {
        name: 'upload-limit',
        ttl: 3_600_000,  // 1 hour window
        limit: 20,       // Max 20 presigned URL requests per hour
      },
    ]),

    // ── Shared Database ─────────────────────────────────────────
    // Same Prisma schema as auth-service — shared via libs/database
    DatabaseModule,

    // ── Feature Modules ─────────────────────────────────────────
    UploadModule,
    HealthModule,
  ],
})
export class AppModule {}
