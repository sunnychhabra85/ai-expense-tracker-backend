# Grafana Implementation Guide

Complete guide for monitoring your AI Finance microservices with Prometheus and Grafana.

## 📋 What's Included

### Docker Compose Stack
- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization with pre-built dashboards
- **Node Exporter**: Host system metrics (optional)

### Pre-configured Dashboards
1. **Microservices Overview**: Health status, request rates, errors, CPU/memory for all services
2. **Service Details**: Deep dive into individual service metrics with variable selection

### Automatic Configuration
- Prometheus datasource auto-configured in Grafana
- Dashboards automatically provisioned on startup
- Alert rules configured in Prometheus

## 🚀 Quick Start

### 1. Start the Monitoring Stack

```powershell
# Windows PowerShell
.\scripts\start-monitoring.ps1
```

Or manually:
```powershell
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Start Your Microservices

```powershell
# Start services with SERVICE_NAME environment variable
$env:SERVICE_NAME='api-gateway'; npx nx serve api-gateway
$env:SERVICE_NAME='auth-service'; npx nx serve auth-service
$env:SERVICE_NAME='upload-service'; npx nx serve upload-service
# ... etc
```

### 3. Access Grafana

Open browser: **http://localhost:3100**

**Login Credentials:**
- Username: `admin`
- Password: `admin`

(You'll be prompted to change password on first login)

### 4. View Dashboards

Navigate to: **Dashboards** → **AI Finance** folder

Available dashboards:
- **Microservices Overview** - All services at a glance
- **Service Details** - Per-service detailed metrics

## 📊 Dashboard Features

### Microservices Overview Dashboard

**Metrics Displayed:**
- ✅ Service health status (up/down)
- 📈 HTTP request rate per service
- ⏱️ Response time percentiles (p50, p95)
- 🖥️ CPU usage per service
- 💾 Memory usage per service
- ❌ HTTP 5xx error rate
- 🔄 Node.js event loop lag

**Use Cases:**
- Monitor overall system health
- Identify performance bottlenecks
- Detect service outages quickly
- Track error rates across services

### Service Details Dashboard

**Features:**
- 🎯 **Service selector**: Choose which service to inspect
- 📊 Request rate by endpoint
- ⏱️ Response time percentiles (p50, p95, p99)
- 🖥️ CPU usage gauge
- 💾 Memory usage gauge
- 🔄 Event loop lag
- 🔌 Active handles count
- 🗄️ Database query duration
- 📊 Business events rate

**Use Cases:**
- Debug specific service issues
- Analyze endpoint performance
- Monitor resource utilization
- Track custom business metrics

## 🔍 Prometheus UI

Access Prometheus: **http://localhost:9090**

**Useful Queries:**
```promql
# Request rate for all services
rate(http_requests_total{app="ai-finance"}[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Memory usage
process_resident_memory_bytes{app="ai-finance"}

# CPU usage percentage
rate(process_cpu_user_seconds_total[5m]) * 100

# Error rate
rate(http_requests_total{status=~"5.."}[5m])
```

## 📁 File Structure

```
monitoring/
├── prometheus/
│   ├── prometheus.yml       # Prometheus configuration
│   └── alerts.yml           # Alert rules
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml    # Auto-configure Prometheus
│   │   └── dashboards/
│   │       └── default.yml       # Dashboard provisioning
│   └── dashboards/
│       ├── microservices-overview.json
│       └── service-details.json
```

## 🎨 Creating Custom Dashboards

### Option 1: Using Grafana UI

1. Click **+** → **Dashboard**
2. Add panels with your metrics
3. Save dashboard to **AI Finance** folder
4. Export JSON and save to `monitoring/grafana/dashboards/`

### Option 2: Editing JSON

1. Edit dashboard JSON files in `monitoring/grafana/dashboards/`
2. Restart Grafana: `docker-compose -f docker-compose.monitoring.yml restart grafana`

### Common Panel Queries

**Request Rate:**
```promql
rate(http_requests_total{service="auth-service"}[5m])
```

**Response Time (95th percentile):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="auth-service"}[5m]))
```

**Memory Usage:**
```promql
process_resident_memory_bytes{service="auth-service"}
```

**Error Rate:**
```promql
rate(http_requests_total{service="auth-service",status=~"5.."}[5m])
```

**Business Events:**
```promql
rate(business_metrics_total{service="upload-service",event_type="receipt_uploaded"}[5m])
```

## 🔔 Setting Up Alerts

### In Grafana

1. Open a dashboard panel
2. Click **Alert** tab
3. Configure alert conditions
4. Set notification channel (email, Slack, etc.)

### Example Alert Configuration

**High Error Rate Alert:**
- Condition: `rate(http_requests_total{status=~"5.."}) > 0.05`
- Evaluate every: 1m
- For: 2m
- Notification: Email/Slack

**High Response Time Alert:**
- Condition: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1`
- Evaluate every: 1m
- For: 5m

## 🔐 Security Best Practices

### For Local Development
Current setup is fine with default `admin/admin`

### For Production

1. **Change Admin Password:**
```yaml
# In docker-compose.monitoring.yml
environment:
  - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
```

2. **Enable HTTPS:**
```yaml
environment:
  - GF_SERVER_PROTOCOL=https
  - GF_SERVER_CERT_FILE=/path/to/cert.pem
  - GF_SERVER_CERT_KEY=/path/to/cert.key
```

3. **Restrict Access:**
- Use reverse proxy (Nginx) with authentication
- Configure firewall rules
- Use VPN for remote access

4. **Protect Metrics Endpoints:**
Add to nginx.conf:
```nginx
location /metrics {
    allow 10.0.0.0/8;  # Internal VPC only
    deny all;
}
```

## 📈 Advanced Configuration

### Add More Scrape Targets

Edit `monitoring/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['host.docker.internal:5432']
        labels:
          service: 'postgres'
  
  - job_name: 'redis'
    static_configs:
      - targets: ['host.docker.internal:6379']
        labels:
          service: 'redis'
```

### Configure Data Retention

In `docker-compose.monitoring.yml`:

```yaml
prometheus:
  command:
    - '--storage.tsdb.retention.time=90d'  # Keep 90 days
    - '--storage.tsdb.retention.size=10GB'  # Max 10GB
```

### Install Grafana Plugins

```yaml
grafana:
  environment:
    - GF_INSTALL_PLUGINS=grafana-piechart-panel,grafana-clock-panel
```

## 🛠️ Troubleshooting

### Prometheus Not Scraping Services

**Issue:** Targets showing as "DOWN" in Prometheus

**Solution:**
1. Check services are running: `curl http://localhost:3001/metrics`
2. Check Docker can access host: `host.docker.internal` resolves correctly
3. Check firewall isn't blocking ports

### Grafana Dashboards Not Loading

**Issue:** Dashboards don't appear in Grafana

**Solution:**
1. Check dashboard JSON is valid
2. Check provisioning path: `/var/lib/grafana/dashboards`
3. Restart Grafana: `docker-compose -f docker-compose.monitoring.yml restart grafana`
4. Check logs: `docker-compose -f docker-compose.monitoring.yml logs grafana`

### No Data in Grafana

**Issue:** Dashboards load but show "No Data"

**Solution:**
1. Verify Prometheus datasource is working: Configuration → Data Sources → Prometheus → Test
2. Check time range (top right) - set to "Last 15 minutes"
3. Verify services are exposing metrics: `curl http://localhost:3001/metrics`
4. Check Prometheus has scraped data: Visit http://localhost:9090/targets

### Metrics Not Appearing

**Issue:** Specific metrics missing

**Solution:**
1. Check metrics endpoint: `curl http://localhost:3001/metrics | grep metric_name`
2. Verify SERVICE_NAME environment variable is set
3. Check Prometheus configuration: http://localhost:9090/config
4. Test query in Prometheus UI first

## 📊 Sample Prometheus Queries

### Request Metrics
```promql
# Total requests per second across all services
sum(rate(http_requests_total[5m]))

# Requests by service
sum by (service) (rate(http_requests_total[5m]))

# Requests by endpoint
sum by (service, path) (rate(http_requests_total[5m]))

# Success rate (2xx/3xx responses)
sum(rate(http_requests_total{status=~"[23].."}[5m])) / sum(rate(http_requests_total[5m]))
```

### Performance Metrics
```promql
# Average response time
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# Response time percentiles
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))  # p50
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))  # p95
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))  # p99
```

### Resource Metrics
```promql
# Total CPU usage across all services
sum(rate(process_cpu_user_seconds_total[5m]))

# Memory usage by service
sum by (service) (process_resident_memory_bytes)

# Total memory usage (MB)
sum(process_resident_memory_bytes) / 1024 / 1024
```

### Error Metrics
```promql
# 5xx error rate
rate(http_requests_total{status=~"5.."}[5m])

# Error percentage
(sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100

# Top error endpoints
topk(5, sum by (service, path) (rate(http_requests_total{status=~"5.."}[5m])))
```

## 🌐 Production Deployment

### AWS Managed Services

**Option 1: Amazon Managed Prometheus (AMP)**
- Fully managed Prometheus service
- No server maintenance
- Auto-scaling
- Cost: ~$0.30 per million samples

**Option 2: Amazon Managed Grafana (AMG)**
- Fully managed Grafana
- Integrated with AWS services
- SSO support
- Cost: ~$9/month per active user

### Self-Hosted on EC2

1. **Deploy monitoring stack on separate EC2:**
```bash
# On EC2 instance
docker-compose -f docker-compose.monitoring.yml up -d
```

2. **Configure security groups:**
- Allow port 9090 (Prometheus) from VPC only
- Allow port 3100 (Grafana) from your IP
- Deny public access to metrics endpoints

3. **Set up Nginx reverse proxy:**
```nginx
server {
    listen 80;
    server_name monitoring.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
    }
}
```

## 📚 Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboard Gallery](https://grafana.com/grafana/dashboards/)

## 🎯 Next Steps

- [x] Start monitoring stack
- [x] Access Grafana dashboards
- [ ] Customize dashboards for your metrics
- [ ] Set up alerting rules
- [ ] Configure notification channels
- [ ] Plan production deployment strategy
- [ ] Set up log aggregation (ELK/Loki)
- [ ] Configure distributed tracing (Jaeger/Tempo)
