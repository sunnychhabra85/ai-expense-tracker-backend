// =============================================================
// apps/api-gateway/src/common/config/app.config.ts
// Application configuration
// =============================================================

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Microservice URLs
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    upload: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3002',
    processing: process.env.PROCESSING_SERVICE_URL || 'http://localhost:3003',
    analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3004',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
  },
  
  // JWT Configuration
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  },
  
  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
});
