// =============================================================
// apps/upload-service/src/common/config/upload.config.ts
// All config pulled from environment (AWS Secrets Manager in prod)
// =============================================================

import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => {
  // Fail fast at startup if required vars are missing
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_SQS_PROCESSING_URL',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3002', 10),
    serviceName: process.env.SERVICE_NAME || 'upload-service',

    // ── Database ─────────────────────────────────────────────
    databaseUrl: process.env.DATABASE_URL,

    // ── JWT — used to validate tokens from auth-service ──────
    // Upload service doesn't ISSUE tokens, only VALIDATES them
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
    },

    // ── AWS S3 ───────────────────────────────────────────────
    s3: {
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET,
      presignedUrlExpiry: parseInt(
        process.env.AWS_S3_PRESIGNED_URL_EXPIRY || '300', // 5 minutes
        10,
      ),
      // Max file size: 10MB for bank statements
      maxFileSizeBytes: parseInt(
        process.env.AWS_S3_MAX_FILE_SIZE || '10485760',
        10,
      ),
    },

    // ── AWS SQS ──────────────────────────────────────────────
    sqs: {
      processingQueueUrl: process.env.AWS_SQS_PROCESSING_URL,
      region: process.env.AWS_REGION,
      // Message delay: give S3 time to finalize upload before processing
      delaySeconds: parseInt(process.env.SQS_DELAY_SECONDS || '5', 10),
    },

    // ── Upload rules ─────────────────────────────────────────
    allowedMimeTypes: ['application/pdf'],
    maxFileSizeBytes: parseInt(
      process.env.MAX_FILE_SIZE_BYTES || '10485760', // 10MB
      10,
    ),
  };
});
