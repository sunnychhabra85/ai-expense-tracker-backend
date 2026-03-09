# =============================================================
# Install Prometheus + Grafana Monitoring Stack (Windows)
# =============================================================

Write-Host "Installing Prometheus + Grafana monitoring stack..." -ForegroundColor Cyan

# Create monitoring namespace
Write-Host "Creating monitoring namespace..." -ForegroundColor Yellow
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Prometheus Helm repository
Write-Host "Adding Prometheus Helm repository..." -ForegroundColor Yellow
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
Write-Host "Installing kube-prometheus-stack..." -ForegroundColor Yellow
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack `
  --namespace monitoring `
  --values "$scriptPath\prometheus-values.yaml" `
  --wait `
  --timeout 10m

# Wait for all pods to be ready
Write-Host "Waiting for all monitoring pods to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=ready pod -l "release=prometheus" -n monitoring --timeout=5m

# Get Grafana credentials
Write-Host ""
Write-Host "Monitoring stack installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Grafana Dashboard:" -ForegroundColor Cyan
Write-Host "   Username: admin"
Write-Host "   Password: admin123"
Write-Host ""
Write-Host "Access Grafana:" -ForegroundColor Cyan
Write-Host "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
Write-Host ""
Write-Host "Prometheus UI:" -ForegroundColor Cyan
Write-Host "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
Write-Host ""
Write-Host "Alertmanager UI:" -ForegroundColor Cyan
Write-Host "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "   1. Apply ServiceMonitors: kubectl apply -f infrastructure/k8s/monitoring/service-monitors.yaml"
Write-Host "   2. Access Grafana and import custom dashboards"
Write-Host "   3. Configure alert notifications in Alertmanager"
