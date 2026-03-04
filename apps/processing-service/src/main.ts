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

  // ── CORS (supports web and mobile apps) ────────────────────
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
  ];
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
  logger.log(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);
  
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Check against explicit allowed origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      
      // In development, allow local network IPs (for mobile devices)
      if (isDevelopment && (origin.startsWith('http://192.168.') || origin.startsWith('http://10.'))) {
        callback(null, true);
        return;
      }
      
      logger.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('CORS not allowed'));
    },
    credentials: true,
  });

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logger.log(`Processing Service (SQS Worker) running on port ${port}`);
  logger.log('Listening for messages on SQS queue...');
}

bootstrap();
