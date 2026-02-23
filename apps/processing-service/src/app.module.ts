// =============================================================
// apps/processing-service/src/app.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { ProcessingModule } from './processing/processing.module';
import { HealthModule } from './common/health/health.module';
import processingConfig from './common/config/processing.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [processingConfig] }),
    DatabaseModule,
    ProcessingModule,
    HealthModule,
  ],
})
export class AppModule {}
