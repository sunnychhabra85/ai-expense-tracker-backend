# API Gateway

The API Gateway serves as the single entry point for all client requests to the Finance Platform microservices.

## Architecture

The gateway routes requests to the appropriate microservice based on the URL path:

```
Client → API Gateway (Port 3000) → Microservices
                                  ├─ Auth Service (3001)
                                  ├─ Upload Service (3002)
                                  ├─ Processing Service (3003)
                                  ├─ Analytics Service (3004)
                                  └─ Notification Service (3005)
```

## Features

- **Request Routing**: Routes requests to appropriate microservices
- **Rate Limiting**: Protects services from abuse
- **CORS Handling**: Centralized CORS configuration
- **Health Checks**: Kubernetes-ready health endpoints
- **API Documentation**: Swagger UI at `/api/docs`
- **Security Headers**: Helmet.js integration

## Route Mapping

| Gateway Path           | Target Service    | Target Path    |
|------------------------|-------------------|----------------|
| `/api/v1/auth/*`       | auth-service      | `/api/v1/*`    |
| `/api/v1/upload/*`     | upload-service    | `/api/v1/*`    |
| `/api/v1/processing/*` | processing-service| `/api/v1/*`    |
| `/api/v1/analytics/*`  | analytics-service | `/api/v1/*`    |
| `/api/v1/notifications/*` | notification-service | `/api/v1/*` |

## Configuration

### Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000

# Microservice URLs (internal Kubernetes DNS)
AUTH_SERVICE_URL=http://auth-service:80
UPLOAD_SERVICE_URL=http://upload-service:80
PROCESSING_SERVICE_URL=http://processing-service:80
ANALYTICS_SERVICE_URL=http://analytics-service:80
NOTIFICATION_SERVICE_URL=http://notification-service:80

# JWT (for potential auth middleware)
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## Local Development

```bash
# Run with nx
nx serve api-gateway

# Run with ts-node
npm run start:api-gateway

# Build
nx build api-gateway

# Test
nx test api-gateway
```

## Docker Build

```bash
# Build image
docker build \
  --build-arg SERVICE_NAME=api-gateway \
  --build-arg PORT=3000 \
  -t api-gateway:latest \
  -f apps/api-gateway/Dockerfile .

# Run container
docker run --rm -d -p 3000:3000 \
  -e AUTH_SERVICE_URL=http://localhost:3001 \
  -e UPLOAD_SERVICE_URL=http://localhost:3002 \
  api-gateway:latest
```

## Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f infrastructure/k8s/api-gateway/all.yaml

# Check status
kubectl get pods -n finance-platform -l app=api-gateway

# View logs
kubectl logs -f deployment/api-gateway -n finance-platform

# Port forward for local testing
kubectl port-forward deployment/api-gateway 3000:3000 -n finance-platform
```

## Health Endpoints

- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/ready` - Readiness check

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`

## Rate Limiting

Default rate limits:
- **Short-term**: 100 requests per minute per IP
- **Long-term**: 1000 requests per hour per IP

## Next Steps

1. **Authentication Middleware**: Add JWT validation for protected routes
2. **Request Logging**: Implement correlation IDs and logging
3. **Circuit Breaker**: Add resilience patterns for downstream failures
4. **Caching**: Implement response caching for frequently accessed data
5. **WebSocket Support**: Add WebSocket proxying for real-time features
