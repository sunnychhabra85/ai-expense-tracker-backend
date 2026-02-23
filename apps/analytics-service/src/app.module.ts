// =============================================================
// apps/analytics-service/src/app.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { HealthModule } from './common/health/health.module';
import analyticsConfig from './common/config/analytics.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [analyticsConfig] }),
    DatabaseModule,
    AnalyticsModule,
    ChatbotModule,
    HealthModule,
  ],
})
export class AppModule {}
