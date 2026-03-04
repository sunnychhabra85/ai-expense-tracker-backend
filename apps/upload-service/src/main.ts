// =============================================================
// apps/upload-service/src/main.ts
// Entry point for the Upload Service (Port 3002)
// =============================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
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
  app.setGlobalPrefix('api/v1');

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
    ],
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
