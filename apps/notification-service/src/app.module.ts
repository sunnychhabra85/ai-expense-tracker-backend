// =============================================================
// apps/notification-service/src/app.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { NotificationModule } from './notification/notification.module';
import { HealthModule } from './common/health/health.module';
import { MetricsModule } from '@finance/shared-monitoring';
import notificationConfig from './common/config/notification.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [notificationConfig] }),
    DatabaseModule,
    NotificationModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
