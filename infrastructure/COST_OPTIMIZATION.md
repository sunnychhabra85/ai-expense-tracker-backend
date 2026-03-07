# Cost Optimization Guide for AWS Deployment

## Overview
This guide shows how to minimize AWS costs for short-term testing (like 5 hours).

**Standard Configuration Cost:** ~$1.89 for 5 hours  
**Optimized Configuration Cost:** ~$0.60 for 5 hours  
**Savings:** $1.29 (68% reduction)

---

## Quick Start: Deploy Minimal Cost Setup

### Option 1: Use the Pre-configured Minimal Setup

```bash
cd infrastructure/terraform

# Use the minimal cost configuration
cp terraform.tfvars.minimal terraform.tfvars

# Deploy
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

**This configuration:**
- ✅ Uses 1x t3.small node (instead of 2x t3.medium)
- ✅ Skips NAT Gateway (nodes in public subnets)
- ✅ Uses smaller EBS volumes
- ✅ Single availability zone option
- ✅ Optimized for testing, not production

### Option 2: Step-by-Step Custom Optimization

If you want to customize further, here's what each change saves:

---

## Cost Optimization Breakdown

### 1. Reduce Node Count and Size
**Savings: $0.31 for 5 hours**

```hcl
# Standard (expensive)
node_instance_types = ["t3.medium"]  # $0.0416/hour each
desired_size        = 2              # 2 nodes = $0.083/hour

# Optimized (cheap)
node_instance_types = ["t3.small"]   # $0.021/hour
desired_size        = 1              # Single node = $0.021/hour
```

### 2. Remove NAT Gateway
**Savings: $0.27 for 5 hours**

```bash
# Standard: Private subnets require NAT Gateway
# Cost: $0.045/hour (fixed) + $0.045/GB processed

# Optimized: Use public subnets for nodes
# Cost: $0 (nodes communicate directly via Internet Gateway)
```

**Security Note:** Nodes still protected by security groups. For production, use NAT Gateway.

Create this as `infrastructure/terraform/modules/network/main-minimal.tf`:

```hcl
# Simplified network without NAT Gateway
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(var.tags, { Name = "${var.project_name}-${var.environment}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags = merge(var.tags, { Name = "${var.project_name}-${var.environment}-igw" })
}

# Only public subnets
resource "aws_subnet" "public" {
  for_each                = { for idx, cidr in var.public_subnet_cidrs : idx => cidr }
  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value
  availability_zone       = var.azs[tonumber(each.key)]
  map_public_ip_on_launch = true
  tags = merge(var.tags, {
    Name                                                           = "${var.project_name}-${var.environment}-public-${each.key}"
    "kubernetes.io/role/elb"                                       = "1"
    "kubernetes.io/cluster/${var.project_name}-${var.environment}" = "shared"
  })
}

# Public route table (no NAT)
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(var.tags, { Name = "${var.project_name}-${var.environment}-public-rt" })
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}
```

Then update your EKS module to use public subnets:

```hcl
# In infrastructure/terraform/main.tf
module "eks" {
  source = "./modules/eks"
  # ...
  # Use public subnets instead of private
  subnet_ids      = module.network.public_subnet_ids
  node_subnet_ids = module.network.public_subnet_ids
  # ...
}
```

### 3. Use Spot Instances (Optional)
**Savings: Additional 50-70% on compute**

Update your EKS node group configuration:

```hcl
# In modules/eks/main.tf
resource "aws_eks_node_group" "this" {
  # ... existing config ...
  
  capacity_type = "SPOT"  # Add this line
  
  # ... rest of config ...
}
```

**Note:** Spot instances can be interrupted. For 5-hour testing, this is usually fine.

### 4. Skip Managed Services for Testing
**Savings: $0.20 for 5 hours**

Instead of RDS and ElastiCache, run databases in-cluster:

```yaml
# infrastructure/k8s/local/postgres.yaml (you already have this!)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: finance-platform
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:16-alpine
        env:
        - name: POSTGRES_PASSWORD
          value: "testpassword"
```

Similarly for Redis. This is fine for testing, not for production.

### 5. Reduce Load Balancer Costs
**Savings: Minimal, but every bit helps**

```yaml
# Use single availability zone for ALB
# In infrastructure/k8s/base/ingress.yaml
annotations:
  alb.ingress.kubernetes.io/subnets: subnet-xxx  # Just one subnet
```

---

## Implementation Steps

### Step 1: Use Minimal Terraform Config

```bash
cd infrastructure/terraform

# Backup your current config
cp terraform.tfvars terraform.tfvars.backup

# Use minimal config
cp terraform.tfvars.minimal terraform.tfvars

# Review what will be created
terraform plan
```

### Step 2: Deploy Minimal Infrastructure

```bash
# Deploy
terraform apply

# Get cluster info
terraform output
```

### Step 3: Deploy Applications

```bash
# Configure kubectl
aws eks update-kubeconfig --name finance-platform-dev-minimal --region ap-south-1

# Deploy services with 1 replica each (instead of 2)
for file in infrastructure/k8s/*/all.yaml; do
  # Reduce replicas to 1
  sed -i 's/replicas: 2/replicas: 1/g' "$file"
  kubectl apply -f "$file"
done
```

### Step 4: Monitor Costs

```bash
# Check what's running
kubectl get nodes
kubectl get pods -n finance-platform

# AWS Cost Explorer (next day)
aws ce get-cost-and-usage \
  --time-period Start=2024-03-07,End=2024-03-08 \
  --granularity DAILY \
  --metrics BlendedCost \
  --region us-east-1
```

---

## Cost Comparison Table

| Component | Standard | Minimal | 5hr Savings |
|-----------|----------|---------|-------------|
| **EKS Control Plane** | $0.10/hr | $0.10/hr | $0.00 |
| **EC2 Compute** | $0.083/hr (2x t3.medium) | $0.021/hr (1x t3.small) | $0.31 |
| **NAT Gateway** | $0.09/hr (fixed+data) | $0.00 | $0.45 |
| **ALB** | $0.031/hr | $0.023/hr | $0.04 |
| **EBS** | $0.014/hr | $0.007/hr | $0.04 |
| **RDS** | $0.021/hr | $0.00 (in-pod) | $0.11 |
| **ElastiCache** | $0.017/hr | $0.00 (in-pod) | $0.09 |
| **Data Transfer** | $0.015/hr | $0.008/hr | $0.04 |
| **Total** | **$0.38/hr** | **$0.12/hr** | **$1.30** |
| **5 Hours** | **$1.90** | **$0.60** | **$1.30** |

---

## When to Use Each Configuration

### Use Standard Configuration When:
- ✅ Production deployment
- ✅ High availability required
- ✅ Heavy traffic expected
- ✅ Running 24/7
- ✅ Sensitive data (needs private subnets)

### Use Minimal Configuration When:
- ✅ Development/testing
- ✅ Demo purposes
- ✅ Learning AWS/EKS
- ✅ Short-term usage (hours/days)
- ✅ Tight budget
- ✅ POC/prototype

### Use Local Kind Cluster When:
- ✅ Initial development
- ✅ Unit/integration testing
- ✅ **Cost is concern** - FREE!
- ✅ No AWS-specific features needed
- ✅ Rapid iteration

---

## Cleanup After Testing

**IMPORTANT:** Remember to destroy resources after testing!

```bash
# Delete Kubernetes resources
kubectl delete namespace finance-platform

# Destroy Terraform infrastructure
cd infrastructure/terraform
terraform destroy

# Verify everything is deleted
aws eks list-clusters --region ap-south-1
aws ec2 describe-instances --region ap-south-1 --filters "Name=tag:Project,Values=finance-platform"
```

**If you forget to clean up:** The standard setup costs ~$5.40/day or ~$181/month!

---

## Advanced: Suspend and Resume

For longer testing periods with breaks:

```bash
# Suspend (keep infrastructure, stop compute)
kubectl scale deployment --all --replicas=0 -n finance-platform

# Cost while suspended: ~$0.15/hour (just EKS control plane + ALB)

# Resume
kubectl scale deployment --all --replicas=1 -n finance-platform
```

---

## Monitoring Your Costs

### Real-time Cost Tracking

```bash
# Install kubecost (optional)
helm install kubecost kubecost/cost-analyzer \
  --namespace kubecost --create-namespace \
  --set kubecostToken="aGVsbUBrdWJlY29zdC5jb20=xm343yadf98"

# Access dashboard
kubectl port-forward -n kubecost deployment/kubecost-cost-analyzer 9090:9090
# Open: http://localhost:9090
```

### AWS Cost Explorer

1. Go to AWS Console → Cost Explorer
2. Filter by Tag: `Project=finance-platform`
3. Set date range to your testing period
4. View hourly breakdown

### Set Billing Alerts

```bash
# Create budget alert
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json
```

Create `budget.json`:
```json
{
  "BudgetName": "EKS-Testing-Budget",
  "BudgetLimit": {
    "Amount": "5",
    "Unit": "USD"
  },
  "TimeUnit": "DAILY",
  "BudgetType": "COST"
}
```

---

## Summary

**For your 5-hour testing:**

1. **Best option:** Use your existing local Kind cluster - **FREE** ✅
2. **If AWS needed:** Use minimal config - **$0.60** 💰
3. **Always clean up:** `terraform destroy` after testing ⚠️

**Remember:** Even the minimal setup costs money. Your local setup is free and already working perfectly!

---

## Quick Reference: Cost per Hour

```
Local Kind Cluster:     $0.00/hour  ⭐
Minimal AWS (1 node):   $0.12/hour  💰
Standard AWS (2 nodes): $0.38/hour  💵
Production AWS:         $0.75/hour  💸
```

For 5 hours:
- Local: **$0.00** ⭐
- Minimal: **$0.60**
- Standard: **$1.90**
- Production: **$3.75**
