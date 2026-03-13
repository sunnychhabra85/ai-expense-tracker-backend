# Metrics Setup Guide

## ✅ Current Configuration

All microservices are now configured to expose Prometheus metrics at `/metrics` endpoint.

## Metrics Endpoints

| Service | Port | Metrics URL |
|---------|------|-------------|
| **Auth Service** | 3001 | http://localhost:3001/metrics |
| **Upload Service** | 3002 | http://localhost:3002/metrics |
| **Processing Service** | 3003 | http://localhost:3003/metrics |
| **Analytics Service** | 3004 | http://localhost:3004/metrics |
| **Notification Service** | 3005 | http://localhost:3005/metrics |
| **API Gateway** | 3000 | http://localhost:3000/metrics |

## What's Been Fixed

### 1. Metrics Module Configuration
- ✅ Fixed `libs/shared-monitoring/src/metrics/metrics.module.ts`
- ✅ All metric providers properly registered
- ✅ PrometheusModule configured with `/metrics` path
- ✅ MetricsInterceptor registered as global APP_INTERCEPTOR

### 2. Metrics Service
- ✅ Fixed `libs/shared-monitoring/src/metrics/metrics.service.ts`
- ✅ Removed duplicate method declarations
- ✅ Proper `@InjectMetric()` decorators for all metrics
- ✅ Helper methods: `recordBusinessEvent()`, `recordDbQuery()`, `recordHttpRequest()`

### 3. Service Bootstrap Files
- ✅ All 6 `main.ts` files updated with:
  ```typescript
  import { RequestMethod } from '@nestjs/common';
  
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'metrics', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET }
    ],
  });
  ```

## Available Metrics

Each service exposes the following metrics:

### Default Node.js Metrics
- `process_cpu_user_seconds_total` - CPU usage
- `process_cpu_system_seconds_total` - System CPU time
- `process_heap_bytes` - Heap memory usage
- `process_resident_memory_bytes` - Resident memory
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_active_handles_total` - Active handles
- `nodejs_active_requests_total` - Active requests

### HTTP Metrics
- `http_requests_total` - Total HTTP requests (labeled by method, path, status, service)
- `http_request_duration_seconds` - HTTP request duration histogram

### Database Metrics
- `db_query_duration_seconds` - Database query duration histogram

### Business Metrics
- `business_metrics_total` - Custom business events counter

## Testing Metrics

### Test Individual Service
```powershell
# Auth Service
curl -UseBasicParsing http://localhost:3001/metrics

# Upload Service
curl -UseBasicParsing http://localhost:3002/metrics

# All services
3001..3005 | ForEach-Object { 
  Write-Host "`n=== Testing Service on Port $_ ===" -ForegroundColor Cyan
  curl -UseBasicParsing "http://localhost:$_/metrics" | Select-Object StatusCode, @{Name='Length';Expression={$_.Content.Length}}
}
```

### Test via API Gateway
```powershell
curl -UseBasicParsing http://localhost:3000/metrics
```

## Environment Configuration

Each service should set the `SERVICE_NAME` environment variable:

```bash
# Linux/Mac
export SERVICE_NAME=auth-service
npm run start:dev

# Windows PowerShell
$env:SERVICE_NAME='auth-service'
npx nx serve auth-service
```

### Docker Compose
Already configured in `docker-compose.yml`:
```yaml
auth-service:
  environment:
    - SERVICE_NAME=auth-service
```

## Adding Prometheus + Grafana (Optional)

To visualize metrics locally, create `docker-compose.monitoring.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3100:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    networks:
      - monitoring

volumes:
  prometheus-data:
  grafana-data:

networks:
  monitoring:
    driver: bridge
```

### Prometheus Configuration (`monitoring/prometheus.yml`)
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'auth-service'
    static_configs:
      - targets: ['host.docker.internal:3001']
        labels:
          service: 'auth-service'
  
  - job_name: 'upload-service'
    static_configs:
      - targets: ['host.docker.internal:3002']
        labels:
          service: 'upload-service'
  
  - job_name: 'processing-service'
    static_configs:
      - targets: ['host.docker.internal:3003']
        labels:
          service: 'processing-service'
  
  - job_name: 'analytics-service'
    static_configs:
      - targets: ['host.docker.internal:3004']
        labels:
          service: 'analytics-service'
  
  - job_name: 'notification-service'
    static_configs:
      - targets: ['host.docker.internal:3005']
        labels:
          service: 'notification-service'
  
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['host.docker.internal:3000']
        labels:
          service: 'api-gateway'
```

### Start Monitoring Stack
```powershell
# Create monitoring directory
New-Item -ItemType Directory -Force -Path monitoring

# Create prometheus.yml
# (Copy content from above)

# Start Prometheus + Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# Access Prometheus: http://localhost:9090
# Access Grafana: http://localhost:3100 (admin/admin)
```

### Grafana Dashboard Setup
1. Open Grafana at http://localhost:3100
2. Login with `admin`/`admin`
3. Add Prometheus datasource: http://prometheus:9090
4. Import dashboard ID `1860` (Node Exporter Full)
5. Create custom dashboard for business metrics

## Production Configuration

### AWS EC2 with Nginx
The `/metrics` endpoint is already configured in `nginx/nginx.conf`:

```nginx
location /metrics {
    proxy_pass http://api_gateway/metrics;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    
    # Optional: Restrict access to specific IPs
    # allow 10.0.0.0/8;    # VPC internal
    # allow 1.2.3.4;        # Your IP
    # deny all;
}
```

Access production metrics:
```bash
curl https://your-domain.com/metrics
```

### Security Recommendations

1. **Restrict Access**: Add IP whitelisting in Nginx
2. **Authentication**: Add basic auth for /metrics endpoint
3. **Private Endpoint**: Keep metrics internal to VPC, don't expose publicly
4. **Prometheus in VPC**: Run Prometheus on a separate EC2 or use AWS Managed Prometheus

### AWS Managed Prometheus (Recommended for Production)
- Amazon Managed Service for Prometheus (AMP)
- No need to manage Prometheus server
- Automatic scaling and high availability
- Pay per metric stored (~$0.30 per million samples)

```bash
# Configure remote_write in Prometheus
remote_write:
  - url: https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx/api/v1/remote_write
    sigv4:
      region: us-east-1
```

## Troubleshooting

### Metrics returning 404
**Issue**: GET http://localhost:3001/api/v1/metrics returns 404

**Solution**: Metrics should be at `/metrics`, not `/api/v1/metrics`. The global prefix is now excluded for the `/metrics` path.

### Port already in use
```powershell
# Find process using port
netstat -ano | findstr :3001

# Kill the process
taskkill /F /PID <PID>
```

### SERVICE_NAME not appearing in labels
Make sure the environment variable is set before starting the service:
```powershell
$env:SERVICE_NAME='auth-service'
npx nx serve auth-service
```

### No metrics data
Check that:
1. Service is running: `curl http://localhost:3001/health`
2. Metrics endpoint accessible: `curl http://localhost:3001/metrics`
3. Metrics library installed: `npm list @willsoto/nestjs-prometheus prom-client`

## Next Steps

- [ ] Test all 6 service metrics endpoints
- [ ] Add custom business metrics using `MetricsService.recordBusinessEvent()`
- [ ] Set up Prometheus + Grafana for local development (optional)
- [ ] Configure AWS Managed Prometheus for production (recommended)
- [ ] Create Grafana dashboards for business KPIs
- [ ] Set up alerting rules in Prometheus

## References

- [Prometheus NestJS](https://github.com/willsoto/nestjs-prometheus) - @willsoto/nestjs-prometheus
- [Prometheus Client](https://github.com/siimon/prom-client) - Node.js Prometheus client
- [Prometheus Documentation](https://prometheus.io/docs/) - Official Prometheus docs
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/) - Pre-built dashboards
