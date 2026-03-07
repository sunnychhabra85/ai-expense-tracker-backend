# AWS Deployment Quick Reference

## Prerequisites Checklist
```bash
- [ ] AWS CLI v2 installed and configured
- [ ] Docker Desktop running
- [ ] kubectl installed (for EKS)
- [ ] Terraform >= 1.6 (for EKS)
- [ ] eksctl installed (for EKS)
- [ ] Helm installed (for EKS)
- [ ] Node.js 20+ and npm
- [ ] AWS Account with admin access
- [ ] Git installed
```

## Quick Start Commands

### Option 1: Automated Deployment (Linux/Mac)
```bash
# Clone repository
git clone https://github.com/sunnychhabra85/ai-expense-tracker-backend.git
cd ai-expense-tracker-backend

# Make script executable
chmod +x scripts/deploy-aws.sh

# Deploy to EKS (recommended)
./scripts/deploy-aws.sh eks

# Or deploy to ECS
./scripts/deploy-aws.sh ecs
```

### Option 2: Automated Deployment (Windows)
```powershell
# Clone repository
git clone https://github.com/sunnychhabra85/ai-expense-tracker-backend.git
cd ai-expense-tracker-backend

# Deploy to EKS
.\scripts\deploy-aws.ps1 -DeploymentType eks

# Or deploy to ECS
.\scripts\deploy-aws.ps1 -DeploymentType ecs
```

### Option 3: Manual Step-by-Step
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## Essential AWS Commands

### Configure AWS
```bash
aws configure
# Region: ap-south-1 (or your preferred region)
```

### ECR Commands
```bash
# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-south-1.amazonaws.com

# List repositories
aws ecr describe-repositories --region ap-south-1

# List images in a repository
aws ecr describe-images --repository-name finance-platform/dev/auth-service --region ap-south-1

# Delete an image
aws ecr batch-delete-image \
  --repository-name finance-platform/dev/auth-service \
  --image-ids imageTag=old-tag \
  --region ap-south-1
```

### EKS Commands
```bash
# Update kubeconfig
aws eks update-kubeconfig --name finance-platform-dev --region ap-south-1

# List clusters
aws eks list-clusters --region ap-south-1

# Describe cluster
aws eks describe-cluster --name finance-platform-dev --region ap-south-1

# Get cluster endpoint
aws eks describe-cluster --name finance-platform-dev \
  --query 'cluster.endpoint' --output text --region ap-south-1
```

### ECS Commands
```bash
# List clusters
aws ecs list-clusters --region ap-south-1

# List services
aws ecs list-services --cluster finance-platform-dev --region ap-south-1

# Describe service
aws ecs describe-services \
  --cluster finance-platform-dev \
  --services auth-service \
  --region ap-south-1

# Update service (force new deployment)
aws ecs update-service \
  --cluster finance-platform-dev \
  --service auth-service \
  --force-new-deployment \
  --region ap-south-1

# Scale service
aws ecs update-service \
  --cluster finance-platform-dev \
  --service auth-service \
  --desired-count 3 \
  --region ap-south-1
```

---

## Kubernetes Commands (EKS)

### Basic Operations
```bash
# Get cluster info
kubectl cluster-info

# Get nodes
kubectl get nodes

# Get all resources
kubectl get all -n finance-platform

# Get pods
kubectl get pods -n finance-platform

# Get services
kubectl get svc -n finance-platform

# Get deployments
kubectl get deployments -n finance-platform

# Get ingress
kubectl get ingress -n finance-platform
```

### Deployment Management
```bash
# Update image for a deployment
kubectl set image deployment/auth-service \
  auth-service=ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/finance-platform/dev/auth-service:new-tag \
  -n finance-platform

# Restart deployment
kubectl rollout restart deployment/auth-service -n finance-platform

# Check rollout status
kubectl rollout status deployment/auth-service -n finance-platform

# Rollback deployment
kubectl rollout undo deployment/auth-service -n finance-platform

# Scale deployment
kubectl scale deployment/auth-service --replicas=3 -n finance-platform
```

### Debugging
```bash
# View logs
kubectl logs -f deployment/auth-service -n finance-platform

# View logs from specific pod
kubectl logs -f pod-name -n finance-platform

# View previous logs (for crashed containers)
kubectl logs --previous pod-name -n finance-platform

# Describe pod
kubectl describe pod pod-name -n finance-platform

# Get events
kubectl get events -n finance-platform --sort-by='.lastTimestamp'

# Shell into pod
kubectl exec -it pod-name -n finance-platform -- /bin/sh

# Port forward to local
kubectl port-forward deployment/auth-service 3001:3001 -n finance-platform
```

### Secret Management
```bash
# Create secret from literal
kubectl create secret generic my-secret \
  --from-literal=key=value \
  -n finance-platform

# Create secret from file
kubectl create secret generic my-secret \
  --from-file=./secret.txt \
  -n finance-platform

# View secrets
kubectl get secrets -n finance-platform

# Describe secret (doesn't show values)
kubectl describe secret my-secret -n finance-platform

# Get secret values (base64 encoded)
kubectl get secret my-secret -n finance-platform -o yaml

# Decode secret value
kubectl get secret my-secret -n finance-platform \
  -o jsonpath='{.data.key}' | base64 --decode

# Delete secret
kubectl delete secret my-secret -n finance-platform
```

---

## Common Tasks

### Deploy New Version
```bash
# Build and push new image
GIT_SHA=$(git rev-parse --short HEAD)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com

docker build -f apps/auth-service/Dockerfile \
  --build-arg SERVICE_NAME=auth-service \
  --build-arg PORT=3001 \
  -t $REGISTRY/finance-platform/dev/auth-service:$GIT_SHA .

docker push $REGISTRY/finance-platform/dev/auth-service:$GIT_SHA

# Update Kubernetes deployment
kubectl set image deployment/auth-service \
  auth-service=$REGISTRY/finance-platform/dev/auth-service:$GIT_SHA \
  -n finance-platform

# Watch rollout
kubectl rollout status deployment/auth-service -n finance-platform
```

### Run Database Migrations
```bash
# Option 1: Via kubectl exec
kubectl exec -it deployment/auth-service -n finance-platform \
  -- npm run prisma:migrate:deploy

# Option 2: Create a Job
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-$(date +%s)
  namespace: finance-platform
spec:
  template:
    spec:
      containers:
      - name: migration
        image: $REGISTRY/finance-platform/dev/auth-service:latest
        command: ["npm", "run", "prisma:migrate:deploy"]
        envFrom:
        - secretRef:
            name: database-credentials
      restartPolicy: Never
  backoffLimit: 3
EOF
```

### Check Application Health
```bash
# Get ALB DNS
ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Test health endpoints
curl http://$ALB_DNS/api/v1/auth/health
curl http://$ALB_DNS/api/v1/upload/health
curl http://$ALB_DNS/api/v1/transactions/health

# Test register endpoint
curl -X POST http://$ALB_DNS/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}'
```

### View Metrics
```bash
# Node metrics
kubectl top nodes

# Pod metrics
kubectl top pods -n finance-platform

# HPA status
kubectl get hpa -n finance-platform

# View HPA details
kubectl describe hpa auth-service-hpa -n finance-platform
```

### Backup Database
```bash
# Get RDS endpoint from Terraform output
cd infrastructure/terraform
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)

# Create backup
pg_dump -h $RDS_ENDPOINT -U admin -d financedb > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -h $RDS_ENDPOINT -U admin -d financedb < backup_20240307.sql
```

---

## Troubleshooting

### Pods Not Starting
```bash
# Check pod status
kubectl get pods -n finance-platform

# Describe pod to see events
kubectl describe pod pod-name -n finance-platform

# Check logs
kubectl logs pod-name -n finance-platform

# Common issues:
# 1. ImagePullBackOff - Check ECR permissions and image exists
# 2. CrashLoopBackOff - Check application logs
# 3. Pending - Check resource requests and node capacity
```

### Image Pull Errors
```bash
# Verify ECR repository exists
aws ecr describe-repositories --region ap-south-1

# Verify image exists
aws ecr describe-images \
  --repository-name finance-platform/dev/auth-service \
  --region ap-south-1

# Check node IAM role has ECR permissions
kubectl describe node | grep InstanceProfile
```

### Service Not Accessible
```bash
# Check service
kubectl get svc -n finance-platform

# Check endpoints
kubectl get endpoints -n finance-platform

# Check ingress
kubectl get ingress -n finance-platform
kubectl describe ingress finance-platform-ingress -n finance-platform

# Check ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

### Database Connection Issues
```bash
# Verify secret exists
kubectl get secret database-credentials -n finance-platform

# Check connection from pod
kubectl exec -it pod-name -n finance-platform -- \
  psql "$DATABASE_URL" -c "SELECT 1"

# Check RDS security group allows EKS nodes
# In AWS Console: RDS → Security Groups
# Ensure EKS node security group can access port 5432
```

---

## Clean Up / Cost Savings

### Scale Down Deployments (Keep Infrastructure)
```bash
# Scale all deployments to 0
kubectl scale deployment --all --replicas=0 -n finance-platform

# Scale back up
kubectl scale deployment --all --replicas=2 -n finance-platform
```

### Stop ECS Services
```bash
# Set desired count to 0
aws ecs update-service \
  --cluster finance-platform-dev \
  --service auth-service \
  --desired-count 0 \
  --region ap-south-1
```

### Destroy Infrastructure (Complete Cleanup)
```bash
# Delete Kubernetes resources
kubectl delete namespace finance-platform

# Delete ALB controller
helm uninstall aws-load-balancer-controller -n kube-system

# Destroy with Terraform
cd infrastructure/terraform
terraform destroy

# Delete ECR repositories (removes images)
SERVICES=(auth-service upload-service processing-service analytics-service notification-service)
for service in "${SERVICES[@]}"; do
  aws ecr delete-repository \
    --repository-name finance-platform/dev/$service \
    --force \
    --region ap-south-1
done
```

---

## GitHub Actions Integration

### Required Secrets
```
Settings → Secrets and variables → Actions → New repository secret

AWS_GITHUB_ACTIONS_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/GitHubActionsDeployRole
AWS_REGION=ap-south-1
EKS_CLUSTER_NAME=finance-platform-dev
```

### Manual Workflow Trigger
```bash
# Via GitHub CLI
gh workflow run cicd.yml

# Or via GitHub UI
# Actions → ci-cd → Run workflow
```

### View Workflow Logs
```bash
# Via GitHub CLI
gh run list
gh run view RUN_ID --log
```

---

## Monitoring & Logs

### CloudWatch Logs
```bash
# View log groups
aws logs describe-log-groups --region ap-south-1

# Tail logs
aws logs tail /aws/eks/finance-platform-dev/cluster --follow --region ap-south-1

# Query logs
aws logs filter-log-events \
  --log-group-name /aws/eks/finance-platform-dev/cluster \
  --filter-pattern "ERROR" \
  --region ap-south-1
```

### Application Metrics
```bash
# Enable Container Insights (already enabled in Terraform)
# View in AWS Console: CloudWatch → Container Insights

# Or via CLI
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=auth-service \
  --start-time 2024-03-07T00:00:00Z \
  --end-time 2024-03-07T23:59:59Z \
  --period 3600 \
  --statistics Average \
  --region ap-south-1
```

---

## Security Best Practices

1. **Rotate secrets regularly**
   ```bash
   kubectl create secret generic database-credentials \
     --from-literal=DATABASE_URL="new-url" \
     --dry-run=client -o yaml | kubectl apply -f -
   
   kubectl rollout restart deployment/auth-service -n finance-platform
   ```

2. **Use AWS Secrets Manager** (Production)
   ```bash
   # Install External Secrets Operator
   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets -n kube-system
   ```

3. **Enable WAF on ALB** (Production)
   ```bash
   # Add annotation to ingress
   kubectl annotate ingress finance-platform-ingress \
     alb.ingress.kubernetes.io/wafv2-acl-arn=arn:aws:wafv2:... \
     -n finance-platform
   ```

4. **Regular updates**
   ```bash
   # Update dependencies
   npm update
   
   # Update base images in Dockerfiles
   # Update EKS cluster version via Terraform
   ```

---

## Support Resources

- **Full Deployment Guide**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Troubleshooting**: [infrastructure/TROUBLESHOOTING_GUIDE.md](./infrastructure/TROUBLESHOOTING_GUIDE.md)
- **AWS EKS Docs**: https://docs.aws.amazon.com/eks/
- **Kubernetes Docs**: https://kubernetes.io/docs/
- **GitHub Actions**: https://docs.github.com/en/actions

---

**Last Updated:** March 2026
