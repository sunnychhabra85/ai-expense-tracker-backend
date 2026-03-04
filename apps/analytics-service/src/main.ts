// =============================================================
// apps/analytics-service/src/main.ts
// Analytics Service — Dashboard APIs + AI Chatbot (Port 3004)
// =============================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AnalyticsService');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Analytics Service API')
      .setDescription('Dashboard insights + AI Chatbot')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 3004;
  await app.listen(port);
  logger.log(`Analytics Service running on port ${port}`);
}
bootstrap();
