# 📊 Prometheus + Grafana Monitoring Setup

Complete monitoring solution for Finance Platform microservices using Prometheus and Grafana.

## 🎯 What's Included

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization dashboards
- **Alertmanager**: Alert routing and notifications
- **ServiceMonitors**: Automatic service discovery
- **Custom Metrics**: Business and technical metrics
- **Pre-built Dashboards**: Service overview, errors, performance

## 📋 Prerequisites

- Kubernetes cluster running (Kind, EKS, or any K8s)
- `kubectl` configured and connected
- `helm` installed (v3+)
- Services deployed in `finance-platform` namespace

## 🚀 Quick Start

### Step 1: Install Monitoring Stack

**Windows (PowerShell):**
```powershell
cd infrastructure/k8s/monitoring
.\install-monitoring.ps1
```

**Linux/Mac (Bash):**
```bash
cd infrastructure/k8s/monitoring
chmod +x install-monitoring.sh
./install-monitoring.sh
```

This will:
- Create `monitoring` namespace
- Install Prometheus, Grafana, and Alertmanager
- Configure default scrapers and exporters

### Step 2: Install Dependencies

Install Prometheus client libraries:
```bash
npm install
```

This installs:
- `@willsoto/nestjs-prometheus`: NestJS Prometheus integration
- `prom-client`: Prometheus client library

### Step 3: Deploy ServiceMonitors

```bash
kubectl apply -f infrastructure/k8s/monitoring/service-monitors.yaml
```

This creates:
- Kubernetes Services for metrics endpoints
- ServiceMonitor resources for Prometheus scraping

### Step 4: Access Grafana

**Option A: Port Forward (Development)**
```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
```
Then open: http://localhost:3000

**Option B: LoadBalancer (Production)**
```bash
kubectl get svc -n monitoring prometheus-grafana
```
Access the external IP/hostname

**Default Credentials:**
- Username: `admin`
- Password: `admin123` (⚠️ Change this in production!)

## 📈 Available Dashboards

### 1. Finance Platform Overview
- HTTP request rate by service
- Response time percentiles (p95, p99)
- Error rates (4xx, 5xx)
- Memory and CPU usage
- Pod health status

**Import:** Already pre-loaded or manually import `grafana-dashboard-overview.json`

### 2. Kubernetes Cluster Overview (Built-in)
- Node metrics
- Pod resource usage
- Namespace statistics

## 🔍 Metrics Endpoints

Each service exposes metrics at:
```
GET http://service:port/metrics
```

Examples:
- Auth Service: `http://auth-service:3001/metrics`
- Upload Service: `http://upload-service:3002/metrics`
- Analytics Service: `http://analytics-service:3004/metrics`

## 📊 Custom Metrics Available

### HTTP Metrics
```
finance_platform_http_requests_total{method, route, status, service}
finance_platform_http_request_duration_seconds{method, route, status, service}
```

### Database Metrics
```
finance_platform_db_query_duration_seconds{operation, table, service}
```

### Business Metrics
```
finance_platform_business_events_total{event_type, service, status}
```

### Node.js Metrics (Default)
```
process_cpu_seconds_total
process_resident_memory_bytes
nodejs_eventloop_lag_seconds
nodejs_gc_duration_seconds
```

## 🔧 Configuration

### Customize Scrape Interval

Edit `prometheus-values.yaml`:
```yaml
prometheus:
  prometheusSpec:
    scrapeInterval: 15s  # Change from 30s to 15s
```

Then upgrade:
```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -f infrastructure/k8s/monitoring/prometheus-values.yaml \
  -n monitoring
```

### Add Custom Metrics

In your service code:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class MyService {
  constructor(
    @InjectMetric('finance_platform_business_events_total')
    private readonly businessEvents: Counter<string>,
  ) {}

  async processTransaction() {
    // Your business logic
    
    // Record metric
    this.businessEvents.inc({
      event_type: 'transaction_processed',
      service: 'processing-service',
      status: 'success',
    });
  }
}
```

### Configure Alerts

Edit `prometheus-values.yaml` under `alertmanager.config`:

```yaml
alertmanager:
  config:
    receivers:
      - name: 'slack'
        slack_configs:
          - api_url: 'YOUR_SLACK_WEBHOOK_URL'
            channel: '#alerts'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

## 🎛️ Access Components

### Prometheus UI
```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```
Open: http://localhost:9090

**Use Cases:**
- Query raw metrics with PromQL
- Test metric queries
- View scrape targets
- Check service discovery

### Alertmanager UI
```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093
```
Open: http://localhost:9093

**Use Cases:**
- View active alerts
- Silence alerts
- Configure notification routing

## 🧪 Testing Metrics

### 1. Check Metrics Endpoint
```bash
# Port-forward to a service
kubectl port-forward -n finance-platform deployment/auth-service 3001:3001

# Fetch metrics
curl http://localhost:3001/metrics
```

### 2. Query Prometheus
Open Prometheus UI and run:
```promql
# Total requests per service
sum(rate(finance_platform_http_requests_total[5m])) by (service)

# p95 latency
histogram_quantile(0.95, rate(finance_platform_http_request_duration_seconds_bucket[5m]))

# Error rate
sum(rate(finance_platform_http_requests_total{status=~"5.."}[5m])) by (service)
```

### 3. View in Grafana
1. Open Grafana
2. Go to "Dashboards" → "Finance Platform - Service Overview"
3. Adjust time range (top-right)
4. Explore panels by clicking on them

## 🐛 Troubleshooting

### ServiceMonitors Not Discovered

**Check ServiceMonitor labels:**
```bash
kubectl get servicemonitors -n finance-platform -o yaml
```

Ensure they have `release: prometheus` label:
```yaml
metadata:
  labels:
    release: prometheus
```

**Check Prometheus config:**
```bash
kubectl get prometheus -n monitoring prometheus-kube-prometheus-prometheus -o yaml
```

Look for `serviceMonitorSelector` - should be empty `{}` to match all.

### No Metrics in Grafana

**1. Check Prometheus targets:**
```bash
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```
Open http://localhost:9090/targets

All finance-platform services should show as "UP".

**2. Check service metrics endpoint:**
```bash
kubectl port-forward -n finance-platform svc/auth-service 3001:3001
curl http://localhost:3001/metrics
```

Should return Prometheus-formatted metrics.

**3. Check Grafana datasource:**
- Grafana → Configuration → Data sources → Prometheus
- Click "Test" - should show "Data source is working"

### Pods Crashing After Adding Metrics

**Check logs:**
```bash
kubectl logs -n finance-platform deployment/auth-service --tail=50
```

**Common issues:**
- Missing `@finance/shared-monitoring` import
- MetricsModule not in app.module imports
- Incompatible package versions

**Fix:**
```bash
# Reinstall dependencies
npm install
npm run build

# Rebuild and redeploy
docker build -t your-registry/auth-service .
kubectl rollout restart deployment/auth-service -n finance-platform
```

### High Memory Usage

Prometheus stores metrics in memory. If memory usage is high:

**Option 1: Reduce retention period**
```yaml
prometheus:
  prometheusSpec:
    retention: 7d  # Instead of 15d
```

**Option 2: Enable storage**
```yaml
prometheus:
  prometheusSpec:
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 20Gi
```

**Option 3: Reduce scrape frequency**
```yaml
# In service-monitors.yaml
endpoints:
  - port: metrics
    path: /metrics
    interval: 60s  # Instead of 30s
```

## 🔐 Security Best Practices

### 1. Change Default Passwords

```bash
# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update Helm values
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  --set grafana.adminPassword=$NEW_PASSWORD \
  -n monitoring
```

### 2. Enable Authentication

Add to `prometheus-values.yaml`:
```yaml
grafana:
  env:
    GF_AUTH_ANONYMOUS_ENABLED: "false"
    GF_AUTH_DISABLE_LOGIN_FORM: "false"
```

### 3. Use HTTPS with Ingress

```yaml
grafana:
  ingress:
    enabled: true
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    tls:
      - secretName: grafana-tls
        hosts:
          - grafana.yourdomain.com
```

## 📚 Useful PromQL Queries

### Service Health
```promql
# Services that are down
up{job=~".*finance.*"} == 0

# Uptime percentage
avg_over_time(up{job=~".*finance.*"}[24h]) * 100
```

### Performance
```promql
# Request rate per minute
sum(rate(finance_platform_http_requests_total[1m])) by (service) * 60

# Average response time
rate(finance_platform_http_request_duration_seconds_sum[5m]) / rate(finance_platform_http_request_duration_seconds_count[5m])

# Slow requests (>1s)
histogram_quantile(0.99, rate(finance_platform_http_request_duration_seconds_bucket[5m])) > 1
```

### Errors
```promql
# Error rate percentage
sum(rate(finance_platform_http_requests_total{status=~"5.."}[5m])) / sum(rate(finance_platform_http_requests_total[5m])) * 100

# Top error endpoints
topk(10, sum(rate(finance_platform_http_requests_total{status=~"5.."}[5m])) by (service, route))
```

### Resources
```promql
# Memory usage
sum(process_resident_memory_bytes{job=~".*finance.*"}) by (service) / 1024 / 1024

# CPU usage percentage
rate(process_cpu_seconds_total{job=~".*finance.*"}[5m]) * 100
```

## 🔄 Updating the Stack

```bash
# Update Helm repo
helm repo update

# Upgrade installation
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -f infrastructure/k8s/monitoring/prometheus-values.yaml \
  -n monitoring
```

## 🗑️ Uninstall

```bash
# Remove monitoring stack
helm uninstall prometheus -n monitoring

# Remove ServiceMonitors
kubectl delete -f infrastructure/k8s/monitoring/service-monitors.yaml

# Delete namespace (optional)
kubectl delete namespace monitoring
```

## 📖 Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
- [@willsoto/nestjs-prometheus GitHub](https://github.com/willsoto/nestjs-prometheus)

## 🆘 Support

For issues related to:
- **Prometheus/Grafana**: Check official documentation
- **ServiceMonitors**: Ensure Prometheus Operator is running
- **Custom Metrics**: Review NestJS service logs
- **Performance**: Adjust retention and scrape intervals

## 📝 Notes

- Default retention: 15 days
- Default scrape interval: 30 seconds
- Grafana anonymous access: Disabled
- Alertmanager: Configured but needs notification channels
- Storage: In-memory (configure PV for persistence)
