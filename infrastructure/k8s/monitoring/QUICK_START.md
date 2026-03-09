# =============================================================
# Complete Monitoring Setup - Quick Reference
# =============================================================

# STEP 1: Install npm dependencies
npm install

# STEP 2: Rebuild all services
npm run build

# STEP 3: Install Prometheus + Grafana Stack (choose your OS)

# Windows:
.\infrastructure\k8s\monitoring\install-monitoring.ps1

# Linux/Mac:
chmod +x infrastructure/k8s/monitoring/install-monitoring.sh
./infrastructure/k8s/monitoring/install-monitoring.sh

# STEP 4: Deploy ServiceMonitors
kubectl apply -f infrastructure/k8s/monitoring/service-monitors.yaml

# STEP 5: Redeploy your services (if already running)
kubectl rollout restart deployment/auth-service -n finance-platform
kubectl rollout restart deployment/upload-service -n finance-platform
kubectl rollout restart deployment/processing-service -n finance-platform
kubectl rollout restart deployment/analytics-service -n finance-platform
kubectl rollout restart deployment/notification-service -n finance-platform
kubectl rollout restart deployment/api-gateway -n finance-platform

# STEP 6: Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Then open: http://localhost:3000
# Username: admin
# Password: admin123

# STEP 7: Verify metrics are being collected
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Open: http://localhost:9090/targets
# All "finance-platform" services should show as "UP"

# STEP 8: Test metrics endpoint (optional)
kubectl port-forward -n finance-platform svc/auth-service 3001:3001
curl http://localhost:3001/metrics

# ============================================================
# Useful Commands
# ============================================================

# View all monitoring pods
kubectl get pods -n monitoring

# View ServiceMonitors
kubectl get servicemonitors -n finance-platform

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# View Grafana logs
kubectl logs -n monitoring deployment/prometheus-grafana -f

# Restart monitoring stack
kubectl rollout restart deployment -n monitoring

# Uninstall monitoring
helm uninstall prometheus -n monitoring
kubectl delete namespace monitoring
