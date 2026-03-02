// =============================================================
// apps/processing-service/src/common/config/processing.config.ts
// =============================================================

import { registerAs } from '@nestjs/config';

export default registerAs('processing', () => {
  const required = ['DATABASE_URL', 'AWS_REGION', 'AWS_SQS_PROCESSING_URL', 'AWS_S3_BUCKET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3003', 10),
    serviceName: 'processing-service',
    databaseUrl: process.env.DATABASE_URL,
    aws: {
      region: process.env.AWS_REGION,
      s3Bucket: process.env.AWS_S3_BUCKET,
      sqsQueueUrl: process.env.AWS_SQS_PROCESSING_URL,
      endpointUrl: process.env.AWS_ENDPOINT_URL,
    },
    // OpenAI for categorization fallback
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    // How many SQS messages to process simultaneously
    sqsConcurrency: parseInt(process.env.SQS_CONCURRENCY || '3', 10),
    sqsWaitTimeSeconds: 20,
    sqsMaxMessages: 10,
  };
});
