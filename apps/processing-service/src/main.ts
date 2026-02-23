// =============================================================
// apps/processing-service/src/main.ts
// SQS Worker — consumes document-processing queue, runs OCR,
// normalizes and categorizes transactions
// =============================================================

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('ProcessingService');

  // Processing service doesn't expose HTTP endpoints (it's a worker)
  // BUT we keep a minimal HTTP server for health checks only
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logger.log(`Processing Service (SQS Worker) running on port ${port}`);
  logger.log('Listening for messages on SQS queue...');
}

bootstrap();
