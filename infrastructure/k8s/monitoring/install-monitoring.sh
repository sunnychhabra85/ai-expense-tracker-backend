#!/bin/bash
# =============================================================
# Install Prometheus + Grafana Monitoring Stack
# =============================================================

set -e

echo "🔍 Installing Prometheus + Grafana monitoring stack..."

# Create monitoring namespace
echo "📦 Creating monitoring namespace..."
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Prometheus Helm repository
echo "📚 Adding Prometheus Helm repository..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
echo "🚀 Installing kube-prometheus-stack..."
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values $(dirname "$0")/prometheus-values.yaml \
  --wait \
  --timeout 10m

# Wait for all pods to be ready
echo "⏳ Waiting for all monitoring pods to be ready..."
kubectl wait --for=condition=ready pod -l "release=prometheus" -n monitoring --timeout=5m

# Get Grafana credentials
echo ""
echo "✅ Monitoring stack installed successfully!"
echo ""
echo "📊 Grafana Dashboard:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "🔗 Access Grafana:"
kubectl get svc -n monitoring prometheus-grafana -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null && echo "" || echo "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
echo ""
echo "📈 Prometheus UI:"
echo "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
echo ""
echo "🔔 Alertmanager UI:"
echo "   Port-forward: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093"
echo ""
echo "📝 Next steps:"
echo "   1. Apply ServiceMonitors: kubectl apply -f infrastructure/k8s/monitoring/service-monitors.yaml"
echo "   2. Access Grafana and import custom dashboards"
echo "   3. Configure alert notifications in Alertmanager"
