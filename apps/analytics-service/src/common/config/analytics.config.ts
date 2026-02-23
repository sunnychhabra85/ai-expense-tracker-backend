// =============================================================
// apps/analytics-service/src/common/config/analytics.config.ts
// =============================================================

import { registerAs } from '@nestjs/config';

export default registerAs('analytics', () => {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3004', 10),
    serviceName: 'analytics-service',
    databaseUrl: process.env.DATABASE_URL,
    jwt: { accessSecret: process.env.JWT_ACCESS_SECRET },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10),
    },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    // Max tokens for chatbot response
    chatMaxTokens: parseInt(process.env.CHAT_MAX_TOKENS || '500', 10),
  };
});
