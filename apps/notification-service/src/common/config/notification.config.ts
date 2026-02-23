// apps/notification-service/src/common/config/notification.config.ts

import { registerAs } from '@nestjs/config';

export default registerAs('notification', () => {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3005', 10),
    serviceName: 'notification-service',
    databaseUrl: process.env.DATABASE_URL,
    jwt: { accessSecret: process.env.JWT_ACCESS_SECRET },
    // SSE keep-alive interval
    sseHeartbeatMs: parseInt(process.env.SSE_HEARTBEAT_MS || '15000', 10),
  };
});
