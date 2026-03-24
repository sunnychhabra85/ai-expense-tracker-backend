# AWS Deployment Guide - AI Finance API
## Complete Guide for Deploying with Docker, ECS/EKS & GitHub Actions

This guide provides **two deployment paths**:
- **Path A: Amazon ECS** (Simpler, fully managed containers)
- **Path B: Amazon EKS** (Kubernetes-based, more control, already configured)

Choose based on your needs:
- **ECS**: Easier to start, less Kubernetes knowledge needed, lower operational overhead
- **EKS**: More flexibility, portable to other clouds, better for complex orchestration

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup (Common for Both Paths)](#initial-setup)
3. [Path A: Deploy to Amazon ECS](#path-a-amazon-ecs)
4. [Path B: Deploy to Amazon EKS](#path-b-amazon-eks)
5. [GitHub Actions CI/CD Setup](#github-actions-cicd)
6. [Post-Deployment Configuration](#post-deployment)
7. [Monitoring & Troubleshooting](#monitoring)
8. [Cost Optimization](#cost-optimization)

---

## Prerequisites

### Required Tools
```bash
# Install AWS CLI v2
# Windows: Download from https://aws.amazon.com/cli/
# Linux/Mac:
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Docker Desktop
# Download from https://www.docker.com/products/docker-desktop

# kubectl (for EKS path)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Terraform
# Download from https://www.terraform.io/downloads

# eksctl (for EKS path)
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Helm (for EKS path)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Verify Installation
```bash
aws --version          # Should show v2.x
docker --version       # Should show 20.x or higher
kubectl version --client
terraform version      # Should show 1.6 or higher
node --version         # Should show v20.x
npm --version
```

### AWS Account Requirements
- AWS Account with admin access (for initial setup)
- Credit card for AWS (free tier eligible for learning)
- Domain name (optional, for production)

---

## Initial Setup (Common for Both Paths)

### Step 1: Configure AWS CLI
```bash
aws configure
# AWS Access Key ID: [Your access key]
# AWS Secret Access Key: [Your secret key]
# Default region name: ap-south-1  # Or your preferred region
# Default output format: json
```

### Step 2: Set Environment Variables
```bash
export AWS_REGION=ap-south-1
export PROJECT_NAME=finance-platform
export ENVIRONMENT=dev
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
```

### Step 3: Create GitHub OIDC Provider (for GitHub Actions)
```bash
# Create the OIDC provider for GitHub Actions
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### Step 4: Build and Test Locally
```bash
# Install dependencies
npm ci

# Run tests
npm test

# Build a sample Docker image locally
docker build \
  --build-arg SERVICE_NAME=auth-service \
  --build-arg PORT=3001 \
  -f apps/auth-service/Dockerfile \
  -t auth-service:local .

# Test locally
docker run --rm -d -p 3001:3001 \
  -e DATABASE_URL="postgresql://admin:localpassword123@host.docker.internal:5432/financedb" \
  auth-service:local

# Check health
curl http://localhost:3001/api/v1/health
```

### Step 5: Create ECR Repositories (Required for Both Paths)
```bash
# Services to deploy
SERVICES=(
  "auth-service"
  "upload-service"
  "processing-service"
  "analytics-service"
  "notification-service"
)

# Create ECR repositories
for service in "${SERVICES[@]}"; do
  aws ecr create-repository \
    --repository-name finance-platform/dev/${service} \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --region $AWS_REGION
done

# Set lifecycle policy to reduce storage costs
for service in "${SERVICES[@]}"; do
  aws ecr put-lifecycle-policy \
    --repository-name finance-platform/dev/${service} \
    --lifecycle-policy-text '{
      "rules": [{
        "rulePriority": 1,
        "description": "Keep last 5 images",
        "selection": {
          "tagStatus": "any",
          "countType": "imageCountMoreThan",
          "countNumber": 5
        },
        "action": { "type": "expire" }
      }]
    }' \
    --region $AWS_REGION
done
```

### Step 6: Push Images to ECR
```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Build and push all services
for service in "${SERVICES[@]}"; do
  # Get port for this service
  case $service in
    auth-service) PORT=3001 ;;
    upload-service) PORT=3002 ;;
    processing-service) PORT=3003 ;;
    analytics-service) PORT=3004 ;;
    notification-service) PORT=3005 ;;
  esac
  
  echo "Building ${service}..."
  REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/finance-platform/dev/${service}"
  
  docker build \
    --build-arg SERVICE_NAME=${service} \
    --build-arg PORT=${PORT} \
    -f apps/${service}/Dockerfile \
    -t ${REPO}:latest \
    -t ${REPO}:$(git rev-parse --short HEAD) \
    .
  
  echo "Pushing ${service}..."
  docker push ${REPO}:latest
  docker push ${REPO}:$(git rev-parse --short HEAD)
done
```

---

## Path A: Amazon ECS

ECS is AWS's fully managed container orchestration service. Simpler than Kubernetes.

### Step A1: Create ECS Infrastructure with Terraform

Create ECS Terraform configuration:

```bash
mkdir -p infrastructure/terraform/modules/ecs
```

Create `infrastructure/terraform/modules/ecs/main.tf`:

```hcl
# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-${var.environment}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  tags = var.tags
}

# Target Groups (one per service)
resource "aws_lb_target_group" "services" {
  for_each = toset(var.service_names)

  name        = "${var.project_name}-${var.environment}-${each.key}"
  port        = var.service_ports[each.key]
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/api/v1/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = var.tags
}

# ALB Listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

# Listener Rules
resource "aws_lb_listener_rule" "auth" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["auth-service"].arn
  }

  condition {
    path_pattern {
      values = ["/api/v1/auth*"]
    }
  }
}

# Add similar rules for other services...
```

Create `infrastructure/terraform/modules/ecs/variables.tf`:

```hcl
variable "project_name" {}
variable "environment" {}
variable "vpc_id" {}
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "alb_sg_id" {}
variable "service_names" { type = list(string) }
variable "service_ports" { type = map(number) }
variable "tags" { type = map(string) }
```

### Step A2: Create ECS Task Definitions

Create `infrastructure/ecs/auth-service-task.json`:

```json
{
  "family": "finance-platform-dev-auth-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/finance-platform-dev-ecs-task-execution",
  "containerDefinitions": [
    {
      "name": "auth-service",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/finance-platform/dev/auth-service:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3001" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:finance-platform/dev/database-url"
        },
        {
          "name": "JWT_ACCESS_SECRET",
          "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:finance-platform/dev/jwt-access-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/finance-platform-dev",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "auth-service"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/api/v1/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Step A3: Create Secrets in AWS Secrets Manager

```bash
# Create database URL secret
aws secretsmanager create-secret \
  --name finance-platform/dev/database-url \
  --secret-string "postgresql://admin:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/financedb" \
  --region $AWS_REGION

# Create JWT secrets
aws secretsmanager create-secret \
  --name finance-platform/dev/jwt-access-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region $AWS_REGION

aws secretsmanager create-secret \
  --name finance-platform/dev/jwt-refresh-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region $AWS_REGION
```

### Step A4: Deploy ECS Services

```bash
# Register task definitions
for service in "${SERVICES[@]}"; do
  aws ecs register-task-definition \
    --cli-input-json file://infrastructure/ecs/${service}-task.json \
    --region $AWS_REGION
done

# Create ECS services
aws ecs create-service \
  --cluster finance-platform-dev \
  --service-name auth-service \
  --task-definition finance-platform-dev-auth-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=auth-service,containerPort=3001" \
  --region $AWS_REGION
```

### Step A5: Verify ECS Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster finance-platform-dev \
  --services auth-service \
  --region $AWS_REGION

# Get ALB DNS
aws elbv2 describe-load-balancers \
  --names finance-platform-dev-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region $AWS_REGION

# Test endpoint
curl http://<ALB_DNS>/api/v1/auth/health
```

---

## Path B: Amazon EKS

EKS provides managed Kubernetes. Your infrastructure is already configured for this.

### Step B1: Provision Infrastructure with Terraform

```bash
cd infrastructure/terraform

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
aws_region           = "ap-south-1"
project_name         = "finance-platform"
environment          = "dev"
vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
kubernetes_version   = "1.28"
node_instance_types  = ["t3.medium"]
desired_size         = 2
min_size             = 1
max_size             = 4
service_names        = ["auth-service", "upload-service", "processing-service", "analytics-service", "notification-service"]
EOF

# Initialize Terraform
terraform init

# Review plan
terraform plan -out=tfplan

# Apply (creates VPC, EKS, ECR, RDS, etc.)
terraform apply tfplan

# Save outputs
terraform output > ../outputs.txt
```

### Step B2: Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --name finance-platform-dev \
  --region $AWS_REGION

# Verify connection
kubectl get nodes
kubectl cluster-info
```

### Step B3: Install AWS Load Balancer Controller

```bash
# Download IAM policy
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json

# Create IAM policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json

# Create IAM role for service account
eksctl create iamserviceaccount \
  --cluster=finance-platform-dev \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name=finance-platform-dev-alb-controller \
  --attach-policy-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve \
  --region=$AWS_REGION

# Install via Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Get VPC ID from Terraform output
VPC_ID=$(terraform output -raw vpc_id)

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=finance-platform-dev \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=$AWS_REGION \
  --set vpcId=$VPC_ID

# Verify
kubectl get deployment -n kube-system aws-load-balancer-controller
```

### Step B4: Create Kubernetes Secrets

```bash
# Create namespace
kubectl create namespace finance-platform

# Create database secret
kubectl create secret generic database-credentials \
  --from-literal=DATABASE_URL="postgresql://admin:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/financedb" \
  -n finance-platform

# Create JWT secrets
kubectl create secret generic jwt-secrets \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -base64 32)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 32)" \
  -n finance-platform

# Create AWS secrets (for services that need S3/SQS)
kubectl create secret generic aws-credentials \
  --from-literal=AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY" \
  --from-literal=AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY" \
  -n finance-platform

# Create OpenAI secret (optional)
kubectl create secret generic openai-secret \
  --from-literal=OPENAI_API_KEY="YOUR_OPENAI_KEY" \
  -n finance-platform
```

### Step B5: Update Kubernetes Manifests with ECR Images

```bash
# Get ECR registry URL
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Update all manifests
for service in auth-service upload-service processing-service analytics-service notification-service; do
  sed -i "s|REPLACE_WITH_ECR/${service}:latest|${REGISTRY}/finance-platform/dev/${service}:latest|g" \
    infrastructure/k8s/${service}/all.yaml
done
```

### Step B6: Deploy to Kubernetes

```bash
# Apply base resources
kubectl apply -f infrastructure/k8s/base/namespace.yaml

# Deploy services
kubectl apply -f infrastructure/k8s/auth-service/all.yaml
kubectl apply -f infrastructure/k8s/upload-service/all.yaml
kubectl apply -f infrastructure/k8s/processing-service/all.yaml
kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
kubectl apply -f infrastructure/k8s/notification-service/all.yaml

# Deploy ingress
kubectl apply -f infrastructure/k8s/base/ingress.yaml

# Wait for rollout
kubectl rollout status deployment/auth-service -n finance-platform
kubectl rollout status deployment/upload-service -n finance-platform
kubectl rollout status deployment/processing-service -n finance-platform
kubectl rollout status deployment/analytics-service -n finance-platform
kubectl rollout status deployment/notification-service -n finance-platform
```

### Step B7: Verify EKS Deployment

```bash
# Check pods
kubectl get pods -n finance-platform

# Check services
kubectl get svc -n finance-platform

# Check ingress
kubectl get ingress -n finance-platform

# Get ALB DNS
ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB DNS: $ALB_DNS"

# Test endpoints
curl http://$ALB_DNS/api/v1/auth/health
curl -X POST http://$ALB_DNS/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}'
```

---

## GitHub Actions CI/CD

### Step 1: Create IAM Role for GitHub Actions

Create `github-actions-role.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:*"
        }
      }
    }
  ]
}
```

Create the role:

```bash
# Replace with your GitHub repo
GITHUB_REPO="sunnychhabra85/ai-expense-tracker-backend"

# Create trust policy file
cat > github-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

# Create IAM role
aws iam create-role \
  --role-name GitHubActionsDeployRole \
  --assume-role-policy-document file://github-trust-policy.json

# Create policy for ECR and EKS access
cat > github-actions-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Create policy
aws iam create-policy \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document file://github-actions-policy.json

# Attach policy to role
aws iam attach-role-policy \
  --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/GitHubActionsDeployPolicy
```

### Step 2: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

```
AWS_GITHUB_ACTIONS_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole
AWS_REGION=ap-south-1
EKS_CLUSTER_NAME=finance-platform-dev
```

### Step 3: Update GitHub Actions Workflow

The workflow at `.github/workflows/cicd.yml` is already configured. Verify these sections:

```yaml
name: ci-cd

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: ap-south-1
  EKS_CLUSTER_NAME: finance-platform-dev

jobs:
  install-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test

  build-push:
    needs: install-test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [auth-service, upload-service, processing-service, analytics-service, notification-service]
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_GITHUB_ACTIONS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push Docker image
        env:
          REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          REPO: finance-platform/dev/${{ matrix.service }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            --build-arg SERVICE_NAME=${{ matrix.service }} \
            -f apps/${{ matrix.service }}/Dockerfile \
            -t $REGISTRY/$REPO:$IMAGE_TAG \
            -t $REGISTRY/$REPO:latest \
            .
          docker push $REGISTRY/$REPO:$IMAGE_TAG
          docker push $REGISTRY/$REPO:latest

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_GITHUB_ACTIONS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }} --region ${{ env.AWS_REGION }}
      
      - name: Deploy to EKS
        run: |
          # Update image tags
          kubectl set image deployment/auth-service \
            auth-service=${{ steps.login-ecr.outputs.registry }}/finance-platform/dev/auth-service:${{ github.sha }} \
            -n finance-platform
          
          # Similar for other services...
          
          # Wait for rollout
          kubectl rollout status deployment/auth-service -n finance-platform
```

### Step 4: Test CI/CD Pipeline

```bash
# Make a change and push
git add .
git commit -m "test: trigger CI/CD pipeline"
git push origin main

# Watch GitHub Actions
# Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

---

## Post-Deployment Configuration

### Database Migration

```bash
# Run migrations via kubectl (EKS)
kubectl exec -it deployment/auth-service -n finance-platform -- npm run prisma:migrate:deploy

# Or create a Job for migrations
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: finance-platform
spec:
  template:
    spec:
      containers:
      - name: migration
        image: ${REGISTRY}/finance-platform/dev/auth-service:latest
        command: ["npm", "run", "prisma:migrate:deploy"]
        envFrom:
        - secretRef:
            name: database-credentials
      restartPolicy: Never
  backoffLimit: 3
EOF
```

### DNS Configuration

```bash
# Get ALB DNS (EKS)
ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Or get ALB DNS (ECS)
ALB_DNS=$(aws elbv2 describe-load-balancers --names finance-platform-dev-alb --query 'LoadBalancers[0].DNSName' --output text)

echo "Create a CNAME record pointing api.yourdomain.com to: $ALB_DNS"
```

### SSL/TLS Configuration

```bash
# Request ACM certificate
aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --region $AWS_REGION

# Update ingress to use HTTPS
kubectl annotate ingress finance-platform-ingress \
  alb.ingress.kubernetes.io/certificate-arn=arn:aws:acm:REGION:ACCOUNT:certificate/CERT_ID \
  alb.ingress.kubernetes.io/listen-ports='[{"HTTP": 80}, {"HTTPS": 443}]' \
  alb.ingress.kubernetes.io/ssl-redirect='443' \
  -n finance-platform
```

---

## Monitoring & Troubleshooting

### CloudWatch Logs

```bash
# View logs (ECS)
aws logs tail /ecs/finance-platform-dev --follow

# View logs (EKS)
kubectl logs -f deployment/auth-service -n finance-platform

# View logs for specific pod
kubectl logs -f <pod-name> -n finance-platform
```

### Debugging Pods

```bash
# Describe pod
kubectl describe pod <pod-name> -n finance-platform

# Get events
kubectl get events -n finance-platform --sort-by='.lastTimestamp'

# Shell into pod
kubectl exec -it <pod-name> -n finance-platform -- /bin/sh

# Check environment variables
kubectl exec <pod-name> -n finance-platform -- env
```

### Performance Monitoring

```bash
# Check HPA status
kubectl get hpa -n finance-platform

# Check resource usage
kubectl top nodes
kubectl top pods -n finance-platform

# View metrics
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
```

### Common Issues

**Issue: Pods stuck in Pending**
```bash
kubectl describe pod <pod-name> -n finance-platform
# Check for resource constraints or node issues
```

**Issue: Image pull errors**
```bash
# Verify ECR authentication
aws ecr get-login-password --region $AWS_REGION

# Check image exists
aws ecr describe-images --repository-name finance-platform/dev/auth-service
```

**Issue: Health check failures**
```bash
# Test health endpoint directly
kubectl port-forward deployment/auth-service 3001:3001 -n finance-platform
curl http://localhost:3001/api/v1/health
```

---

## Cost Optimization

### EKS Cost Reduction

```bash
# Scale down when not in use
kubectl scale deployment --all --replicas=0 -n finance-platform

# Scale up when needed
kubectl scale deployment --all --replicas=2 -n finance-platform

# Use Spot instances (add to Terraform)
# node_capacity_type = "SPOT"
```

### ECS Cost Reduction

```bash
# Set desired count to 0 when not in use
aws ecs update-service \
  --cluster finance-platform-dev \
  --service auth-service \
  --desired-count 0
```

### General Cost Optimization

1. **Use Fargate Spot (ECS)** - 70% cost savings
2. **Right-size instances** - Start with t3.small, scale up only if needed
3. **Enable autoscaling** - Scale down during low traffic
4. **Use ECR lifecycle policies** - Already configured
5. **Delete unused resources:**

```bash
# Destroy infrastructure when not using
cd infrastructure/terraform
terraform destroy

# Or destroy specific modules
terraform destroy -target=module.eks
```

### Monthly Cost Estimate

**EKS (2 t3.medium nodes):**
- EKS Control Plane: $73/month
- EC2 instances: ~$60/month
- NAT Gateway: $32/month
- Load Balancer: $16/month
- **Total: ~$181/month**

**ECS Fargate (5 services, 2 tasks each):**
- Fargate tasks: ~$90/month
- Load Balancer: $16/month
- **Total: ~$106/month**

**Shared costs:**
- RDS db.t3.micro: $15/month
- ElastiCache t3.micro: $12/month
- S3 + data transfer: ~$5/month

---

## Production Checklist

- [ ] Enable WAF on ALB
- [ ] Configure Route53 with health checks
- [ ] Set up CloudWatch alarms
- [ ] Enable RDS automated backups
- [ ] Configure Redis cluster mode
- [ ] Implement External Secrets Operator
- [ ] Set up Prometheus + Grafana
- [ ] Enable AWS GuardDuty
- [ ] Configure VPC Flow Logs
- [ ] Set up disaster recovery plan
- [ ] Enable multi-region replication
- [ ] Configure CDN (CloudFront)
- [ ] Implement rate limiting
- [ ] Set up penetration testing schedule
- [ ] Create runbooks for common issues

---

## Next Steps

1. **Set up staging environment** - Copy deployment with different namespace/cluster
2. **Implement blue-green deployments** - Use Flagger or Argo Rollouts
3. **Add observability** - OpenTelemetry, Jaeger for distributed tracing
4. **Enhance security** - Implement Falco, use OPA for policy enforcement
5. **Optimize performance** - Redis caching, CDN, database query optimization

---

## Support & Resources

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

For issues, check:
- `infrastructure/TROUBLESHOOTING_GUIDE.md`
- CloudWatch Logs
- GitHub Actions logs
- kubectl logs/events

---

**Last Updated:** March 2026
**Version:** 1.0
