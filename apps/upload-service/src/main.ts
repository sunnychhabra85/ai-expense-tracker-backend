// =============================================================
// apps/upload-service/src/main.ts
// Entry point for the Upload Service (Port 3002)
// =============================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';
// import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('UploadService');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // ── Global prefix ───────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }, { path: 'health', method: RequestMethod.GET }],
  });

  // ── Global validation pipe ──────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Global exception filter ─────────────────────────────────
  // Returns consistent error shape across all endpoints
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global interceptors ─────────────────────────────────────
  app.useGlobalInterceptors(
    new CorrelationInterceptor(), // Adds x-correlation-id to every request
    // new LoggingInterceptor(),     // Logs request/response with timing
  );
  logger.log('Global interceptors registered: CorrelationInterceptor', process.env.ALLOWED_ORIGINS);
  // ── CORS ────────────────────────────────────────────────────
   const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:8081',
    ];
  logger.log(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);
  app.enableCors({
    origin: (origin, callback) => {
      logger.log(`CORS check for origin: ${origin}`);
      logger.log(`CORS check for origin condition: ${!origin || allowedOrigins.includes(origin)}`);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.log(`CORS blocked for origin: ${origin}`);
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
    ],
    exposedHeaders: ['x-correlation-id'],
  });

  // ── Swagger (dev only) ──────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Upload Service API')
      .setDescription('Handles secure PDF upload → S3 → SQS processing pipeline')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    logger.log('Swagger at http://localhost:3002/api/docs');
  }

  const port = process.env.PORT || 3002;
  await app.listen(port);
  logger.log(`Upload Service running on port ${port}`);
}

bootstrap();
