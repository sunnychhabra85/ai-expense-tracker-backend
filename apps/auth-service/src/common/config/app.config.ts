// =============================================================
// apps/auth-service/src/common/config/app.config.ts
// Centralized config — pulls from environment variables
// All vars must be set in AWS Secrets Manager → K8s Secret
// =============================================================

import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  // Validate required env vars at startup — fail fast if missing
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    } 
  }

  return {
    // ── App ──────────────────────────────────────────────────
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),
    serviceName: process.env.SERVICE_NAME || 'auth-service',

    // ── Database ─────────────────────────────────────────────
    databaseUrl: process.env.DATABASE_URL,

    // ── JWT ──────────────────────────────────────────────────
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',   // Short-lived
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',  // Longer-lived
    },

    // ── Security ─────────────────────────────────────────────
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  };
});
