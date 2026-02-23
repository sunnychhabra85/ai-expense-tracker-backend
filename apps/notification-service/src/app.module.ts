// =============================================================
// apps/notification-service/src/app.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../../libs/database/src/database.module';
import { NotificationModule } from './notification/notification.module';
import { HealthModule } from './common/health/health.module';
import notificationConfig from './common/config/notification.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [notificationConfig] }),
    DatabaseModule,
    NotificationModule,
    HealthModule,
  ],
})
export class AppModule {}
