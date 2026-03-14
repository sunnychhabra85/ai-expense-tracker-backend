# Grafana Quick Start

## ✅ What's Running

Your monitoring stack is now live:

| Service | URL | Status |
|---------|-----|--------|
| **Grafana** | http://localhost:3100 | ✅ Running |
| **Prometheus** | http://localhost:9090 | ✅ Running |
| **Node Exporter** | http://localhost:9100 | ✅ Running |

## 🔐 Login to Grafana

**URL:** http://localhost:3100

**Credentials:**
- Username: `admin`
- Password: `admin`

(Change password on first login)

## 📊 Available Dashboards

After logging in, navigate to:
**Dashboards** → **Browse** → **AI Finance** folder

### 1. Microservices Overview
- Service health status
- Request rates across all services
- Response time percentiles
- CPU and memory usage
- Error rates

### 2. Service Details
- Select service from dropdown
- Detailed per-endpoint metrics
- Database query performance
- Business events tracking

## 🚀 Start Your Services

For Prometheus to scrape metrics, start your services:

```powershell
# Terminal 1 - API Gateway
$env:SERVICE_NAME='api-gateway'
npx nx serve api-gateway

# Terminal 2 - Auth Service
$env:SERVICE_NAME='auth-service'
npx nx serve auth-service

# Terminal 3 - Upload Service
$env:SERVICE_NAME='upload-service'
npx nx serve upload-service

# Add more services as needed...
```

**Or use the test script:**
```powershell
.\scripts\test-metrics.ps1
```

## 📈 Verify Metrics Collection

### Check Prometheus Targets
1. Open http://localhost:9090/targets
2. Verify services show "UP" status
3. Green indicators = metrics are being collected

### Check Grafana Dashboards
1. Open http://localhost:3100
2. Login with admin/admin
3. Browse to "AI Finance - Microservices Overview"
4. Verify data is appearing (may take 10-30 seconds)

## 🛠️ Common Commands

```powershell
# View logs
docker-compose -f docker-compose.monitoring.yml logs -f

# View specific service logs
docker-compose -f docker-compose.monitoring.yml logs -f prometheus
docker-compose -f docker-compose.monitoring.yml logs -f grafana

# Restart monitoring stack
docker-compose -f docker-compose.monitoring.yml restart

# Stop monitoring stack
docker-compose -f docker-compose.monitoring.yml down

# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d
```

## 📊 Sample Prometheus Queries

Open http://localhost:9090 and try these queries:

**Request Rate:**
```promql
rate(http_requests_total{app="ai-finance"}[5m])
```

**Response Time (95th percentile):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**CPU Usage:**
```promql
rate(process_cpu_user_seconds_total{app="ai-finance"}[5m]) * 100
```

**Memory Usage:**
```promql
process_resident_memory_bytes{app="ai-finance"} / 1024 / 1024
```

**Error Rate:**
```promql
rate(http_requests_total{status=~"5.."}[5m])
```

## 🎨 Customize Dashboards

### Option 1: In Grafana UI
1. Open existing dashboard
2. Click "Add Panel"
3. Write PromQL query
4. Configure visualization
5. Save dashboard

### Option 2: Edit JSON Files
1. Export dashboard from Grafana (Share → Export)
2. Save to `monitoring/grafana/dashboards/`
3. Restart Grafana to reload

## 🔔 Set Up Alerts (Optional)

1. Open Grafana
2. Go to dashboard panel
3. Click "Alert" tab
4. Configure condition (e.g., "Error rate > 5%")
5. Set notification channel
6. Save

## 📁 Files Created

```
docker-compose.monitoring.yml          # Docker Compose for monitoring stack
monitoring/
├── prometheus/
│   ├── prometheus.yml                 # Prometheus configuration
│   └── alerts.yml                     # Alert rules
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── prometheus.yml         # Auto-configure datasource
    │   └── dashboards/
    │       └── default.yml            # Dashboard provisioning
    └── dashboards/
        ├── microservices-overview.json
        └── service-details.json
scripts/
└── start-monitoring.ps1               # Easy startup script
```

## 🎯 Next Steps

- [x] ✅ Monitoring stack running
- [x] ✅ Grafana accessible
- [x] ✅ Prometheus collecting metrics
- [ ] Start your microservices
- [ ] View live dashboards
- [ ] Customize for your needs
- [ ] Set up alerting rules

## 💡 Tips

1. **First Time Setup:** It may take 10-30 seconds for metrics to appear in dashboards
2. **No Data?** Check services are running and exposing `/metrics` endpoint
3. **Can't Access?** Ensure Docker Desktop is running and ports 3100, 9090 are free
4. **Need Help?** Check logs: `docker-compose -f docker-compose.monitoring.yml logs`

## 📚 Documentation

- **Full Guide:** [GRAFANA_SETUP_GUIDE.md](GRAFANA_SETUP_GUIDE.md)
- **Metrics Setup:** [METRICS_SETUP.md](METRICS_SETUP.md)
- **Prometheus Docs:** https://prometheus.io/docs/
- **Grafana Docs:** https://grafana.com/docs/

---

**Quick Access URLs:**
- Grafana: http://localhost:3100 (admin/admin)
- Prometheus: http://localhost:9090
- Node Exporter: http://localhost:9100
