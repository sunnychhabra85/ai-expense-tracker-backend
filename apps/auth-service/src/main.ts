// =============================================================
// apps/auth-service/src/main.ts
// Production-ready NestJS bootstrap
// =============================================================

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('AuthService');

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
  // API prefix
  // Example: /api/v1/auth/login
  // ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

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
  // CORS (single clean configuration)
  // ──────────────────────────────────────────────────────────
  logger.log(`Configuring CORS with allowed origins: ${process.env.ALLOWED_ORIGINS}`);
  logger.log(`Configuring CORS with allowed origins: ${JSON.stringify(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()))}`);
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

  // ──────────────────────────────────────────────────────────
  // Swagger (only in dev)
  // ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    try {
      const config = new DocumentBuilder()
        .setTitle('Auth Service API')
        .setDescription('Authentication & Authorization Service')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, config);

      SwaggerModule.setup('api/docs', app, document);

      logger.log('Swagger running at /api/docs');
    } catch (error) {
      logger.warn(
        `Swagger failed to initialize: ${(error as Error).message}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────
  // Start server
  // ──────────────────────────────────────────────────────────
  const port = process.env.PORT || 3001;

  await app.listen(port, '0.0.0.0');

  logger.log(`Auth Service running on port ${port}`);
}

bootstrap();