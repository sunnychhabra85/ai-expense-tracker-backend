# Local Pre-EKS Testing Workflow (Beginner Friendly)

This guide helps you validate Docker, Kubernetes, ingress routing, health checks, autoscaling, Terraform, and CI/CD **locally** before deploying to AWS EKS.

---

## 0) Recommended DevOps Folder Structure

```text
.
├── .env.example
├── docker-compose.yml
├── apps/
├── infrastructure/
│   ├── k8s/
│   │   ├── base/
│   │   ├── auth-service/
│   │   ├── upload-service/
│   │   ├── processing-service/
│   │   ├── analytics-service/
│   │   ├── notification-service/
│   │   └── local/
│   │       ├── ingress-nginx-local.yaml
│   │       └── health-probe-and-hpa-example.yaml
│   ├── terraform/
│   └── LOCAL_TESTING_WORKFLOW.md
└── .github/workflows/cicd.yml
```

---

## 1) Docker Local Environment (Production-like)

### Step 1: Prepare env

```bash
cp .env.example .env
```

Update secrets/API keys as needed in `.env`.

### Step 2: Run all services in separate containers

```bash
docker compose up -d --build
```

### Step 3: Validate container health and networking

```bash
docker compose ps
docker network inspect finance_network
```

### Step 4: Check health endpoint per service

```bash
curl -s http://localhost:3001/api/v1/health
curl -s http://localhost:3002/api/v1/health
curl -s http://localhost:3003/api/v1/health
curl -s http://localhost:3004/api/v1/health
curl -s http://localhost:3005/api/v1/health
```

### Stop everything

```bash
docker compose down -v
```

---

## 2) Local Kubernetes Testing with Kind (preferred)

### Step 1: Install tools

- kind
- kubectl
- helm
- docker

### Step 2: Create local cluster

```bash
kind create cluster --name finance-local
kubectl cluster-info --context kind-finance-local
```

### Step 3: Build images and load into kind

```bash
for svc in auth-service upload-service processing-service analytics-service notification-service; do
  docker build -f apps/${svc}/Dockerfile -t ${svc}:local .
  kind load docker-image ${svc}:local --name finance-local
done
```

### Step 4: Point manifests to local image tags

For each `infrastructure/k8s/*/all.yaml`, set:

- `image: <service-name>:local`
- `imagePullPolicy: IfNotPresent`

### Step 5: Deploy manifests

```bash
kubectl apply -f infrastructure/k8s/base/namespace.yaml
kubectl apply -f infrastructure/k8s/auth-service/all.yaml
kubectl apply -f infrastructure/k8s/upload-service/all.yaml
kubectl apply -f infrastructure/k8s/processing-service/all.yaml
kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
kubectl apply -f infrastructure/k8s/notification-service/all.yaml
kubectl get pods -n finance-platform
kubectl get svc -n finance-platform
```

---

## 3) Ingress Simulation (NGINX instead of ALB)

Production uses ALB ingress. For local testing, use NGINX ingress controller.

### Step 1: Install ingress-nginx in kind

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

### Step 2: Apply local ingress routes

```bash
kubectl apply -f infrastructure/k8s/local/ingress-nginx-local.yaml
kubectl get ingress -n finance-platform
```

Routes configured:

- `/api/auth` → `auth-service`
- `/api/upload` → `upload-service`
- `/api/transactions` → `analytics-service`

### Step 3: Test route mapping

```bash
curl -i http://localhost/api/auth/health
curl -i http://localhost/api/upload/health
curl -i http://localhost/api/transactions/health
```

---

## 4) Health Check Validation (Liveness + Readiness)

Your services already expose:

- `/api/v1/health` (liveness)
- `/api/v1/health/ready` (readiness)

Example probe config is included in:

- `infrastructure/k8s/local/health-probe-and-hpa-example.yaml`

Validate probes:

```bash
kubectl describe pod -n finance-platform
kubectl get events -n finance-platform --sort-by=.lastTimestamp
```

---

## 5) Autoscaling Simulation (HPA)

### Step 1: Enable metrics server (kind)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl get deployment metrics-server -n kube-system
```

### Step 2: Create HPA

```bash
kubectl autoscale deployment auth-service \
  -n finance-platform \
  --cpu-percent=70 \
  --min=1 \
  --max=3
kubectl get hpa -n finance-platform -w
```

### Step 3: Generate load (example)

```bash
kubectl run -n finance-platform loadgen --rm -it --image=busybox -- /bin/sh
# inside pod:
while true; do wget -q -O- http://auth-service/api/v1/health; done
```

---

## 6) Terraform Validation Before AWS Apply

Run from `infrastructure/terraform`:

```bash
terraform init -backend=false
terraform fmt -recursive
terraform validate
terraform plan -var-file=environments/dev/terraform.tfvars.example
```

Suggested quality/security tools:

- `tflint` (lint + cloud best practices)
- `tfsec` or `checkov` (security misconfig checks)
- `infracost` (cost estimation)

---

## 7) CI/CD Local Simulation with `act`

### Step 1: Install act

```bash
act --version
```

### Step 2: Simulate GitHub Actions pipeline

```bash
act push -j install-test
```

If you want to run all jobs, pass required AWS secrets (or skip AWS-dependent jobs locally):

```bash
act push \
  --secret AWS_GITHUB_ACTIONS_ROLE_ARN=fake \
  --secret AWS_REGION=ap-south-1
```

> Tip: local-first flow is usually `install-test` + Docker build jobs first, then AWS deploy jobs in GitHub.

---

## 8) Pre-Deployment Checklist (Must Pass)

- [ ] Docker images build successfully for all services.
- [ ] `docker compose up -d --build` runs without crash loops.
- [ ] Each service health endpoint returns success.
- [ ] Kubernetes manifests apply cleanly (`kubectl apply`).
- [ ] Pods become `Ready` and stay stable.
- [ ] NGINX ingress routing works for `/api/auth`, `/api/upload`, `/api/transactions`.
- [ ] HPA created and shows CPU metrics.
- [ ] Terraform `fmt`, `validate`, and `plan` are clean.
- [ ] GitHub Actions simulation with `act` runs tests and builds.

---

## 9) Cost-Efficient AWS Deployment Strategy (Learning Mode)

- Prefer **one small managed node group** to start (scale later).
- Use tiny instances first (e.g., `t3.small` / `t3.medium` depending on load).
- Keep desired node count low (1 or 2 nodes).
- Use a **single ALB ingress** shared across all services.
- Use HPA min replicas = 1 initially.
- Use CloudWatch log retention limits to reduce storage cost.
- Shut down dev environments when not in use (or use separate workspace and destroy).
- Keep non-critical workloads in one environment (`dev`) until stable.

---

## 10) Suggested Local-to-EKS Validation Workflow (Order)

1. `docker compose` full-stack run + smoke tests
2. Unit/integration tests (`npm test`)
3. Build Docker images for all services
4. Kind cluster deployment + pod readiness checks
5. NGINX ingress routing tests
6. HPA and metrics tests
7. Terraform validate/plan
8. `act` CI simulation
9. Deploy to AWS EKS dev

This sequence catches most image, config, networking, health probe, and deployment issues **before** cloud costs are incurred.
