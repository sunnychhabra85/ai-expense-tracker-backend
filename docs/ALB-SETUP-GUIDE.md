# AWS Application Load Balancer Setup Guide

Complete guide for setting up AWS Application Load Balancer (ALB) with AWS Load Balancer Controller on Amazon EKS.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [Manual Setup (Step-by-Step)](#manual-setup-step-by-step)
- [Terraform Setup (Automated)](#terraform-setup-automated)
- [Verification](#verification)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Cost Estimation](#cost-estimation)

---

## Overview

The AWS Load Balancer Controller manages AWS Elastic Load Balancers for Kubernetes clusters. It provisions:

- **Application Load Balancer (ALB)** when you create a Kubernetes Ingress
- **Network Load Balancer (NLB)** when you create a Kubernetes Service of type LoadBalancer

This guide covers ALB setup for internet-facing application access.

---

## Prerequisites

✅ **Required:**
- Amazon EKS cluster (v1.28+)
- AWS CLI configured with appropriate credentials
- `kubectl` configured to access the cluster
- Helm v3 installed
- Terraform v1.6+ (for automated setup)

✅ **Permissions:**
- IAM permissions to create OIDC providers, roles, and policies
- EKS cluster admin access

---

## Architecture

```
Internet
    ↓
Application Load Balancer (ALB)
    ↓
Target Groups (one per service)
    ↓
Kubernetes Services (ClusterIP)
    ↓
Pods (microservices)
```

**Components:**
- **EKS OIDC Provider**: Enables IAM roles for Kubernetes service accounts
- **ALB Controller IAM Role**: Grants permissions to manage ALB resources
- **ALB Controller**: Kubernetes controller watching Ingress resources
- **Ingress Resource**: Defines routing rules for ALB

---

## Manual Setup (Step-by-Step)

### Step 1: Enable OIDC Provider for EKS Cluster

The OIDC provider allows Kubernetes service accounts to assume AWS IAM roles.

```bash
# Get cluster name
CLUSTER_NAME="finance-platform-dev-minimal"

# Get OIDC issuer URL
OIDC_ISSUER=$(aws eks describe-cluster --name $CLUSTER_NAME \
  --query "cluster.identity.oidc.issuer" --output text)

echo "OIDC Issuer: $OIDC_ISSUER"

# Extract OIDC ID
OIDC_ID=$(echo $OIDC_ISSUER | sed 's|https://||')

# Create OIDC provider
aws iam create-open-id-connect-provider \
  --url $OIDC_ISSUER \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list "9e99a48a9960b14926bb7f3b02e22da2b0ab7280"
```

**Output:**
```json
{
  "OpenIDConnectProviderArn": "arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks.REGION.amazonaws.com/id/OIDC_ID"
}
```

### Step 2: Download ALB Controller IAM Policy

```bash
# Create scripts directory
mkdir -p infrastructure/scripts

# Download IAM policy (v3.1.0)
curl -o infrastructure/scripts/alb-iam-policy-v3.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.1.0/docs/install/iam_policy.json
```

### Step 3: Create IAM Policy

```bash
# Create IAM policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy-v3 \
  --policy-document file://infrastructure/scripts/alb-iam-policy-v3.json
```

**Output:**
```
arn:aws:iam::ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy-v3
```

### Step 4: Create IAM Trust Policy

Create `infrastructure/scripts/alb-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/oidc.eks.REGION.amazonaws.com/id/OIDC_ID"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.REGION.amazonaws.com/id/OIDC_ID:aud": "sts.amazonaws.com",
          "oidc.eks.REGION.amazonaws.com/id/OIDC_ID:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }
  ]
}
```

**Replace:**
- `ACCOUNT_ID` with your AWS account ID
- `REGION` with your AWS region (e.g., ap-south-1)
- `OIDC_ID` with your cluster's OIDC ID

### Step 5: Create IAM Role

```bash
# Create IAM role
aws iam create-role \
  --role-name finance-platform-dev-alb-controller \
  --assume-role-policy-document file://infrastructure/scripts/alb-trust-policy.json \
  --description "IAM role for AWS Load Balancer Controller"
```

**Output:**
```
arn:aws:iam::ACCOUNT_ID:role/finance-platform-dev-alb-controller
```

### Step 6: Attach Policy to Role

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam attach-role-policy \
  --role-name finance-platform-dev-alb-controller \
  --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy-v3
```

### Step 7: Add Helm Repository

```bash
# Add EKS Helm chart repository
helm repo add eks https://aws.github.io/eks-charts

# Update repositories
helm repo update
```

### Step 8: Install AWS Load Balancer Controller

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="finance-platform-dev-minimal"
VPC_ID=$(aws eks describe-cluster --name $CLUSTER_NAME \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="arn:aws:iam::${AWS_ACCOUNT_ID}:role/finance-platform-dev-alb-controller" \
  --set vpcId=$VPC_ID
```

### Step 9: Verify Controller Installation

```bash
# Check controller pods
kubectl get pods -n kube-system | grep aws-load-balancer

# Expected output:
# aws-load-balancer-controller-xxxxx   1/1     Running   0          2m
# aws-load-balancer-controller-yyyyy   1/1     Running   0          2m

# Check logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=50
```

### Step 10: Create Kubernetes Ingress

Create `infrastructure/k8s/base/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: finance-platform-ingress
  namespace: finance-platform
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /api/v1/health
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/load-balancer-name: finance-platform-alb
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /api/v1/auth
            pathType: Prefix
            backend:
              service:
                name: auth-service
                port:
                  number: 80
          - path: /api/v1/upload
            pathType: Prefix
            backend:
              service:
                name: upload-service
                port:
                  number: 80
          - path: /api/v1/transactions
            pathType: Prefix
            backend:
              service:
                name: analytics-service
                port:
                  number: 80
          - path: /api/v1/analytics
            pathType: Prefix
            backend:
              service:
                name: analytics-service
                port:
                  number: 80
          - path: /api/v1/notifications
            pathType: Prefix
            backend:
              service:
                name: notification-service
                port:
                  number: 80
```

### Step 11: Apply Ingress

```bash
kubectl apply -f infrastructure/k8s/base/ingress.yaml
```

### Step 12: Get ALB URL

```bash
# Wait for ALB to be provisioned (2-3 minutes)
kubectl get ingress finance-platform-ingress -n finance-platform

# Output:
# NAME                       CLASS   HOSTS   ADDRESS                                    PORTS   AGE
# finance-platform-ingress   alb     *       finance-platform-alb-xxxxx.region.elb...   80      3m
```

---

## Terraform Setup (Automated)

### Overview

Terraform automates the entire ALB setup process. Use this for reproducible infrastructure.

### File Structure

```
infrastructure/terraform/
├── main.tf                                    # Root configuration
├── variables.tf                               # Root variables
├── outputs.tf                                 # Root outputs
├── versions.tf                                # Provider versions
├── terraform.tfvars.minimal                   # Minimal config
└── modules/
    └── alb-controller/
        ├── main.tf                            # ALB module logic
        ├── variables.tf                       # Module variables
        ├── outputs.tf                         # Module outputs
        ├── alb-controller-iam-policy.json     # IAM policy
        └── README.md                          # Module docs
```

### Step 1: Initialize Terraform

```bash
cd infrastructure/terraform

# Initialize with new providers
terraform init -upgrade
```

### Step 2: Review Configuration

Key settings in `terraform.tfvars.minimal`:

```hcl
# ALB Controller Configuration
enable_alb_controller  = true
alb_controller_version = "1.7.1"
```

### Step 3: Plan Deployment

```bash
terraform plan -var-file=terraform.tfvars.minimal
```

**Expected resources:**
- `aws_iam_openid_connect_provider.eks` - OIDC provider
- `aws_iam_policy.alb_controller` - IAM policy
- `aws_iam_role.alb_controller` - IAM role
- `aws_iam_role_policy_attachment.alb_controller` - Policy attachment
- `helm_release.aws_load_balancer_controller` - Helm deployment

### Step 4: Apply Configuration

```bash
terraform apply -var-file=terraform.tfvars.minimal
```

### Step 5: Verify Outputs

```bash
terraform output

# Expected:
# alb_controller_role_arn = "arn:aws:iam::ACCOUNT:role/finance-platform-dev-minimal-alb-controller"
# oidc_provider_arn = "arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks..."
```

### Importing Existing Resources

If you already manually created resources:

```bash
# Import OIDC provider
terraform import -var-file=terraform.tfvars.minimal \
  'module.alb_controller.aws_iam_openid_connect_provider.eks[0]' \
  'arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks.REGION.amazonaws.com/id/OIDC_ID'

# Import IAM policy
terraform import -var-file=terraform.tfvars.minimal \
  module.alb_controller.aws_iam_policy.alb_controller \
  'arn:aws:iam::ACCOUNT:policy/AWSLoadBalancerControllerIAMPolicy-v3'

# Import IAM role
terraform import -var-file=terraform.tfvars.minimal \
  module.alb_controller.aws_iam_role.alb_controller \
  'finance-platform-dev-minimal-alb-controller'

# Import policy attachment
terraform import -var-file=terraform.tfvars.minimal \
  module.alb_controller.aws_iam_role_policy_attachment.alb_controller \
  'finance-platform-dev-minimal-alb-controller/arn:aws:iam::ACCOUNT:policy/AWSLoadBalancerControllerIAMPolicy-v3'
```

---

## Verification

### 1. Check Controller Pods

```bash
kubectl get pods -n kube-system | grep aws-load-balancer
```

**Expected:**
```
aws-load-balancer-controller-xxxxx   1/1     Running   0          5m
aws-load-balancer-controller-yyyyy   1/1     Running   0          5m
```

### 2. Check Ingress Status

```bash
kubectl get ingress finance-platform-ingress -n finance-platform
```

**Expected:**
```
NAME                       CLASS   HOSTS   ADDRESS                                PORTS   AGE
finance-platform-ingress   alb     *       finance-platform-alb-xxxxx.elb...     80      5m
```

### 3. Check ALB Target Groups

```bash
ALB_ARN=$(aws elbv2 describe-load-balancers --names finance-platform-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

TG_ARNS=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN \
  --query 'TargetGroups[*].TargetGroupArn' --output text)

for TG in $TG_ARNS; do
  echo "Target Group: $TG"
  aws elbv2 describe-target-health --target-group-arn $TG \
    --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State]' \
    --output table
done
```

**Expected:**
```
Target Group: arn:aws:elasticloadbalancing:...
----------------------------
|   DescribeTargetHealth   |
+--------------+-----------+
|  10.20.1.217 |  healthy  |
+--------------+-----------+
```

### 4. Check Controller Logs

```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=100
```

**Look for:**
- ✅ "Successfully reconciled" messages
- ✅ No error messages about permissions
- ✅ ALB provisioning events

---

## Testing

### 1. Get ALB DNS Name

```bash
ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "ALB URL: http://$ALB_DNS"
```

### 2. Test Health Endpoints

```bash
# Auth service
curl http://$ALB_DNS/api/v1/auth/health

# Upload service
curl http://$ALB_DNS/api/v1/upload/health

# Analytics service
curl http://$ALB_DNS/api/v1/analytics/health

# Notification service
curl http://$ALB_DNS/api/v1/notifications/health
```

### 3. Test API Registration Endpoint

```bash
curl -X POST http://$ALB_DNS/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456",
    "name": "Test User"
  }'
```

**Expected (successful):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": { ... }
}
```

### 4. Load Test (Optional)

```bash
# Install Apache Bench
# Ubuntu: apt-get install apache2-utils
# macOS: brew install httpd

# Run 100 requests with 10 concurrent connections
ab -n 100 -c 10 http://$ALB_DNS/api/v1/auth/health
```

---

## Troubleshooting

### Issue: Controller Pods Not Starting

**Symptoms:**
```
aws-load-balancer-controller-xxxxx   0/1     CrashLoopBackOff   0          2m
```

**Solution:**
```bash
# Check logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Common errors:
# 1. "failed to get VPC ID" → Set vpcId in Helm values
# 2. "AccessDenied" → Check IAM policy and role trust policy
# 3. "invalid webhook configuration" → Delete and reinstall:
helm uninstall aws-load-balancer-controller -n kube-system
# Wait 30 seconds, then reinstall
```

### Issue: Ingress Shows No ADDRESS

**Symptoms:**
```
NAME                       CLASS   HOSTS   ADDRESS   PORTS   AGE
finance-platform-ingress   alb     *                 80      10m
```

**Solution:**
```bash
# Check events
kubectl describe ingress finance-platform-ingress -n finance-platform

# Check for common issues:
# 1. "FailedDeployModel: no subnets available" → Tag subnets:
aws ec2 create-tags --resources subnet-xxxxx \
  --tags Key=kubernetes.io/role/elb,Value=1

# 2. "AccessDenied" → Controller needs updated IAM policy
# 3. "no endpoints available" → Wait for controller pods to be ready
```

### Issue: Targets Unhealthy in Target Group

**Symptoms:**
Target health checks showing "unhealthy"

**Solution:**
```bash
# Check target group health check configuration
ALB_ARN=$(aws elbv2 describe-load-balancers --names finance-platform-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

aws elbv2 describe-target-health --target-group-arn $TG_ARN

# Verify pods are running and healthy
kubectl get pods -n finance-platform -o wide

# Check if health endpoint is accessible
POD_IP=$(kubectl get pod -n finance-platform -l app=auth-service \
  -o jsonpath='{.items[0].status.podIP}')
kubectl run test-pod --rm -it --image=curlimages/curl -- \
  curl http://$POD_IP:3001/api/v1/health
```

### Issue: 404 Not Found on ALB

**Symptoms:**
```json
{"message":"Cannot GET /api/v1/auth/health","error":"Not Found","statusCode":404}
```

**Solution:**
```bash
# Verify ingress path configuration matches controller routing
kubectl get ingress finance-platform-ingress -n finance-platform -o yaml

# Check if services exist and have endpoints
kubectl get svc -n finance-platform
kubectl get endpoints -n finance-platform

# Verify controller reconciled the ingress
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller \
  | grep finance-platform-ingress
```

### Issue: OIDC Provider Already Exists

**Symptoms:**
```
EntityAlreadyExists: Provider with url ... already exists
```

**Solution:**
```bash
# Use existing OIDC provider in Terraform
# terraform.tfvars.minimal:
enable_alb_controller = true

# In module override:
create_oidc_provider = false
oidc_provider_arn = "arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks..."
```

### Issue: Helm Release Already Exists

**Symptoms:**
```
Error: cannot re-use a name that is still in use
```

**Solution:**
```bash
# Option 1: Uninstall and let Terraform manage it
helm uninstall aws-load-balancer-controller -n kube-system

# Option 2: Don't install via Helm in Terraform
# terraform.tfvars:
install_alb_controller = false  # Only create IAM resources
```

---

## Cost Estimation

### ALB Controller Components

| Resource | Cost | Notes |
|----------|------|-------|
| **IAM Resources** | Free | OIDC provider, roles, policies |
| **Controller Pods** | Free | Runs on existing EKS nodes |
| **Application Load Balancer** | ~$16-20/month | $0.0225/hour + LCU charges |
| **Target Groups** | Free | Included with ALB |
| **Data Transfer** | Variable | $0.09/GB out to internet |

### Monthly Cost Breakdown

**Minimal deployment (1 ALB):**
- ALB (730 hours): $16.43
- Processing (10 LCUs/hour avg): $5.84
- Data transfer (100 GB): $9.00
- **Total: ~$31/month**

**Production deployment (1 ALB, higher traffic):**
- ALB (730 hours): $16.43
- Processing (50 LCUs/hour avg): $29.20
- Data transfer (500 GB): $45.00
- **Total: ~$91/month**

### Cost Optimization Tips

1. **Single ALB**: Route multiple services through one ALB using Ingress paths
2. **Idle timeout**: Reduce connection timeouts for unused connections
3. **Target type IP**: More efficient than instance targets (already configured)
4. **Delete when testing**: Remove ALB when not actively testing
5. **Monitor LCUs**: Check CloudWatch metrics for LCU consumption

---

## Additional Resources

### Official Documentation
- [AWS Load Balancer Controller Docs](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [ALB Ingress Annotations](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.7/guide/ingress/annotations/)
- [EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)

### Ingress Examples
```yaml
# HTTPS with ACM certificate
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:REGION:ACCOUNT:certificate/xxxxx
alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS": 443}]'

# WAF integration
alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:REGION:ACCOUNT:regional/webacl/xxxxx

# Custom health check
alb.ingress.kubernetes.io/healthcheck-path: /health
alb.ingress.kubernetes.io/healthcheck-interval-seconds: '30'
alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
alb.ingress.kubernetes.io/healthy-threshold-count: '2'
alb.ingress.kubernetes.io/unhealthy-threshold-count: '3'

# Access logs
alb.ingress.kubernetes.io/load-balancer-attributes: access_logs.s3.enabled=true,access_logs.s3.bucket=my-bucket
```

### Useful Commands

```bash
# Check all ingresses
kubectl get ingress --all-namespaces

# Describe ALB
ALB_ARN=$(aws elbv2 describe-load-balancers --names finance-platform-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN

# View target groups
aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN

# Check controller version
kubectl get deployment aws-load-balancer-controller -n kube-system \
  -o jsonpath='{.spec.template.spec.containers[0].image}'

# Update controller
helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --reuse-values
```

---

## Summary

### Manual Setup
✅ 12 steps to configure ALB manually  
✅ Suitable for learning and one-time setups  
✅ Requires manual updates for changes

### Terraform Setup
✅ Single `terraform apply` command  
✅ Infrastructure as Code - version controlled  
✅ Reproducible across environments  
✅ Easier to maintain and update

### Recommendation
- **Learning/Testing**: Use manual setup to understand components
- **Production**: Use Terraform for reproducibility and automation
- **Migration**: Import existing resources into Terraform state

Your application is now accessible via:
```
http://finance-platform-alb-838485582.ap-south-1.elb.amazonaws.com
```

All services route through this single ALB with path-based routing! 🚀
