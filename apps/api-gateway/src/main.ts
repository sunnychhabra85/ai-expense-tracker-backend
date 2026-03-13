// =============================================================
// apps/api-gateway/src/main.ts
// Entry point for API Gateway (Port 3000)
// =============================================================

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';

async function bootstrap() {
  const logger = new Logger('ApiGateway');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // ──────────────────────────────────────────────────────────
  // Graceful shutdown (important for Kubernetes)
  // ──────────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ──────────────────────────────────────────────────────────
  // Security headers
  // ──────────────────────────────────────────────────────────
  app.use(helmet());

  // ──────────────────────────────────────────────────────────
  // Correlation ID for request tracing
  // ──────────────────────────────────────────────────────────
  app.useGlobalInterceptors(new CorrelationInterceptor());

  // ──────────────────────────────────────────────────────────
  // API prefix
  // ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }, { path: 'health', method: RequestMethod.GET }],
  });

  // ──────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ──────────────────────────────────────────────────────────
  // CORS
  // ──────────────────────────────────────────────────────────
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:8081',
    ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });

  logger.log(`CORS enabled for origins: ${allowedOrigins.join(', ')}`);

  // ──────────────────────────────────────────────────────────
  // Swagger API Documentation
  // ──────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Finance Platform API Gateway')
    .setDescription('API Gateway for Finance Platform Microservices')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('upload', 'Document upload endpoints')
    .addTag('analytics', 'Analytics and AI endpoints')
    .addTag('notifications', 'Real-time notification endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ──────────────────────────────────────────────────────────
  // Start server
  // ──────────────────────────────────────────────────────────
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 API Gateway running on http://localhost:${port}`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`💚 Health check: http://localhost:${port}/api/v1/health`);
}

bootstrap();
