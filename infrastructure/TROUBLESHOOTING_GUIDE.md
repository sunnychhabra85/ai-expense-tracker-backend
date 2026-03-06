# Troubleshooting Guide - Local Kubernetes Setup

This document contains all issues encountered during local Kind cluster setup and their solutions.

---

## Issue 1: Missing DATABASE_URL Environment Variable

### Error:
```
[Nest] 11  - 03/06/2026, 2:28:53 PM   ERROR [ExceptionHandler] Missing required env var: DATABASE_URL
```

### Root Cause:
All Kubernetes service secrets had empty `DATABASE_URL` values in the manifest files.

### Solution:
Updated all service secrets in `infrastructure/k8s/*/all.yaml` files to include proper DATABASE_URL values:

```yaml
stringData:
  DATABASE_URL: "postgresql://admin:localpassword123@postgres:5432/financedb"
  JWT_ACCESS_SECRET: "local-dev-access-secret-min-32-chars-ok"
```

---

## Issue 2: Database Permission Denied

### Error:
```
PrismaClientInitializationError: User `admin` was denied access on the database `financedb.public`
```

### Root Cause:
1. Database schema was not initialized (no tables existed)
2. Database permissions were not properly set for the admin user

### Solution:

**Step 1: Run Prisma migrations to create tables**
```powershell
$podName = kubectl get pod -l app=postgres -n finance-platform -o jsonpath='{.items[0].metadata.name}'
Get-Content libs/database/prisma/migrations/20260302055232_ai_finance/migration.sql | kubectl exec -i $podName -n finance-platform -- psql -U admin -d financedb
```

**Step 2: Create Prisma migration tracking table**
```powershell
kubectl exec $podName -n finance-platform -- psql -U admin -d financedb -c "CREATE TABLE IF NOT EXISTS _prisma_migrations (id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, finished_at TIMESTAMPTZ, migration_name VARCHAR(255) NOT NULL, logs TEXT, rolled_back_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_steps_count INTEGER NOT NULL DEFAULT 0);"
```

**Step 3: Grant proper permissions**
```powershell
docker exec finance_postgres psql -U admin -d financedb -c "GRANT ALL PRIVILEGES ON DATABASE financedb TO admin; GRANT ALL PRIVILEGES ON SCHEMA public TO admin; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;"
```

---

## Issue 3: Kind Pods Cannot Reach Windows Host

### Error:
Services couldn't connect to postgres/redis running on Windows host at `192.168.0.252:5432`

### Root Cause:
Kind cluster on Windows has network isolation - pods cannot directly access services on the Windows host using `host.docker.internal` or host IP addresses.

### Solution:
Deploy postgres and redis **inside the Kind cluster** instead of relying on external services.

**Created:** `infrastructure/k8s/local/postgres.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: finance-platform
data:
  POSTGRES_DB: financedb
  POSTGRES_USER: admin
  POSTGRES_PASSWORD: localpassword123
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: finance-platform
spec:
  # ... postgres deployment config
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: finance-platform
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
---
# Similar for Redis
```

**Deploy:**
```bash
kubectl apply -f infrastructure/k8s/local/postgres.yaml
```

**Update all service secrets to use internal service names:**
```yaml
DATABASE_URL: "postgresql://admin:localpassword123@postgres:5432/financedb"
REDIS_URL: "redis://:localredispass@redis:6379"
```

---

## Issue 4: Image Pull Errors

### Error:
```
Failed to pull image "notification-service:latest": pull access denied, repository does not exist
```

### Root Cause:
1. Some services were configured to use `:latest` tag instead of `:local`
2. Images were not loaded into the Kind cluster

### Solution:

**Step 1: Load images into Kind**
```bash
kind load docker-image notification-service:local --name finance-local
kind load docker-image processing-service:local --name finance-local
kind load docker-image upload-service:local --name finance-local
```

**Step 2: Update manifests to use `:local` tag**
```yaml
# In infrastructure/k8s/*/all.yaml
containers:
  - name: service-name
    image: service-name:local  # Changed from :latest
    imagePullPolicy: IfNotPresent
```

---

## Issue 5: Ingress Not Accessible on Port 80

### Error:
```
curl: (7) Failed to connect to localhost port 80 after 2253 ms
```

### Root Cause:
Kind cluster was not created with port 80/443 mapped to the Windows host. The ingress controller is running inside the cluster but not exposed.

### Solution:
Use `kubectl port-forward` to access the ingress controller:

```bash
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8080:80
```

**Test endpoints:**
```bash
curl.exe http://localhost:8080/api/auth/health
curl.exe http://localhost:8080/api/upload/health
curl.exe http://localhost:8080/api/transactions/health
```

**Fixed ingress path rewriting in** `infrastructure/k8s/local/ingress-nginx-local.yaml`:
```yaml
annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /api/v1/$2  # Changed from /$2
```

---

## Issue 6: HPA Metrics Not Available

### Error:
```
Warning FailedGetResourceMetric horizontalpodautoscaler/auth-service-hpa
failed to get cpu utilization: unable to get metrics for resource cpu: 
unable to fetch metrics from resource metrics API: the server could not find the requested resource
```

### Root Cause:
Metrics-server was not installed in the Kind cluster, so HPAs couldn't collect CPU/memory metrics.

### Solution:

**Step 1: Install metrics-server**
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

**Step 2: Patch for Kind compatibility**
```bash
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

**Step 3: Verify metrics collection**
```bash
kubectl top nodes
kubectl top pods -n finance-platform
kubectl get hpa -n finance-platform
```

**Expected output:**
```
NAME                       TARGETS       MINPODS   MAXPODS   REPLICAS
analytics-service-hpa      cpu: 1%/70%   1         3         1
auth-service-hpa           cpu: 1%/70%   1         3         1
```

---

## Issue 7: Terraform Syntax Errors

### Error:
```
Error: Invalid single-argument block definition
  on variables.tf line 1, in variable "aws_region":
   1: variable "aws_region" { type = string default = "ap-south-1" }
A single-line block definition must end with a closing brace immediately after its single argument definition.
```

### Root Cause:
All variable definitions in `variables.tf` used incorrect single-line syntax.

### Solution:
Changed all variables from single-line to proper multi-line format:

**Before (incorrect):**
```terraform
variable "aws_region" { type = string default = "ap-south-1" }
```

**After (correct):**
```terraform
variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
```

**Validation commands:**
```bash
cd infrastructure/terraform
terraform init -backend=false
terraform fmt -recursive
terraform validate
```

---

## Complete Working Setup Summary

### 1. Kubernetes Resources Deployed:
- ✅ Postgres database (in-cluster)
- ✅ Redis cache (in-cluster)
- ✅ All 5 microservices (auth, upload, processing, analytics, notification)
- ✅ Ingress controller (nginx)
- ✅ Metrics-server for HPA
- ✅ HorizontalPodAutoscalers for all services

### 2. Access Points:
- **Services via Ingress:** `http://localhost:8080/api/*`
- **Direct pod access:** `kubectl port-forward` or `kubectl exec`

### 3. Verification Commands:

```bash
# Check all pods
kubectl get pods -n finance-platform

# Check services
kubectl get svc -n finance-platform

# Check ingress
kubectl get ingress -n finance-platform

# Check HPA status
kubectl get hpa -n finance-platform

# Test endpoints
curl.exe http://localhost:8080/api/auth/health
curl.exe http://localhost:8080/api/upload/health
curl.exe http://localhost:8080/api/transactions/health

# Check metrics
kubectl top nodes
kubectl top pods -n finance-platform

# View logs
kubectl logs -l app=auth-service -n finance-platform --tail=20
```

### 4. Key Files Created/Modified:

| File | Purpose |
|------|---------|
| `infrastructure/k8s/local/postgres.yaml` | Postgres & Redis deployments for Kind |
| `infrastructure/k8s/local/ingress-nginx-local.yaml` | Fixed ingress path rewriting |
| `infrastructure/k8s/*/all.yaml` | Updated secrets with proper DATABASE_URL |
| `infrastructure/terraform/variables.tf` | Fixed Terraform variable syntax |

---

## Quick Start Commands for Future Setup

```bash
# 1. Create Kind cluster
kind create cluster --name finance-local

# 2. Build and load images
for svc in auth-service upload-service processing-service analytics-service notification-service; do
  docker build -f apps/${svc}/Dockerfile -t ${svc}:local .
  kind load docker-image ${svc}:local --name finance-local
done

# 3. Deploy infrastructure
kubectl apply -f infrastructure/k8s/base/namespace.yaml
kubectl apply -f infrastructure/k8s/local/postgres.yaml

# 4. Wait for postgres to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n finance-platform --timeout=60s

# 5. Initialize database
$podName = kubectl get pod -l app=postgres -n finance-platform -o jsonpath='{.items[0].metadata.name}'
Get-Content libs/database/prisma/migrations/20260302055232_ai_finance/migration.sql | kubectl exec -i $podName -n finance-platform -- psql -U admin -d financedb

# 6. Deploy services
kubectl apply -f infrastructure/k8s/auth-service/all.yaml
kubectl apply -f infrastructure/k8s/upload-service/all.yaml
kubectl apply -f infrastructure/k8s/processing-service/all.yaml
kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
kubectl apply -f infrastructure/k8s/notification-service/all.yaml

# 7. Install ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=180s

# 8. Apply ingress routes
kubectl apply -f infrastructure/k8s/local/ingress-nginx-local.yaml

# 9. Install metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'

# 10. Forward ingress port (in background)
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8080:80
```

---

## Troubleshooting Tips

### Pods in CrashLoopBackOff:
```bash
# Check logs
kubectl logs <pod-name> -n finance-platform --tail=50

# Describe pod for events
kubectl describe pod <pod-name> -n finance-platform
```

### Ingress not working:
```bash
# Verify ingress controller is running
kubectl get pods -n ingress-nginx

# Check ingress configuration
kubectl describe ingress -n finance-platform

# Verify port-forward is active
netstat -ano | findstr :8080
```

### Database connection issues:
```bash
# Test connection from inside cluster
kubectl run test-db -n finance-platform --rm -i --restart=Never --image=postgres:16-alpine -- psql "postgresql://admin:localpassword123@postgres:5432/financedb" -c "\dt"

# Check postgres logs
kubectl logs -l app=postgres -n finance-platform
```

### Metrics not showing:
```bash
# Check metrics-server
kubectl get deployment metrics-server -n kube-system
kubectl logs -l k8s-app=metrics-server -n kube-system

# Test metrics API
kubectl top nodes
kubectl top pods -n finance-platform
```

---

## Common PowerShell Commands for Windows

```powershell
# Find Windows IP (for reference, though not used in final solution)
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Where-Object {$_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "127.*"}).IPAddress

# Check running processes on port
Get-NetTCPConnection -LocalPort 8080 -State Listen

# Kill process by port (if needed)
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess -Force

# Background port-forward (use Start-Process)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8080:80"
```

---

## Additional Resources

- **Kind Documentation:** https://kind.sigs.k8s.io/docs/user/quick-start/
- **Kubernetes Ingress:** https://kubernetes.io/docs/concepts/services-networking/ingress/
- **Metrics Server:** https://github.com/kubernetes-sigs/metrics-server
- **Prisma Migrations:** https://www.prisma.io/docs/concepts/components/prisma-migrate

---

**Document Version:** 1.0  
**Last Updated:** March 6, 2026  
**Cluster:** finance-local (Kind)  
**Namespace:** finance-platform
