# AWS Cost Quick Reference

## 🎯 For 5 Hours of Testing

| Setup | Cost | Best For |
|-------|------|----------|
| **Local Kind** | **$0.00** ⭐ | Development, testing (recommended!) |
| **Minimal AWS** | **$0.60** 💰 | AWS-specific testing |
| **Standard AWS** | **$1.90** 💵 | Production-like testing |

## 💰 Quick Cost-Saving Commands

### Deploy Minimal Configuration (68% savings)
```powershell
# Windows
.\scripts\deploy-aws-minimal.ps1

# Linux/Mac
chmod +x scripts/deploy-aws-minimal.sh
./scripts/deploy-aws-minimal.sh
```

### Scale Down (Pause while keeping infrastructure)
```bash
# Stop all pods (saves compute costs)
kubectl scale deployment --all --replicas=0 -n finance-platform

# Cost while scaled down: ~$0.15/hour (just control plane + ALB)

# Resume
kubectl scale deployment --all --replicas=1 -n finance-platform
```

### Complete Cleanup
```bash
# Delete everything to stop all charges
cd infrastructure/terraform
terraform destroy
```

## 📊 Hourly Cost Breakdown

### Standard Configuration
```
├─ EKS Control Plane    $0.10/hr
├─ 2x t3.medium        $0.08/hr
├─ NAT Gateway         $0.09/hr  ← Expensive!
├─ Application LB      $0.03/hr
├─ RDS db.t3.micro     $0.02/hr
├─ ElastiCache         $0.02/hr
└─ Other              $0.04/hr
────────────────────────────────
Total:                 $0.38/hr = $1.90 for 5 hours
```

### Minimal Configuration  
```
├─ EKS Control Plane    $0.10/hr
├─ 1x t3.small         $0.02/hr
├─ NAT Gateway         $0.00/hr  ← Saved!
├─ Application LB      $0.02/hr
├─ In-pod PostgreSQL   $0.00/hr  ← Saved!
├─ In-pod Redis        $0.00/hr  ← Saved!
└─ Other              $0.02/hr
────────────────────────────────
Total:                 $0.12/hr = $0.60 for 5 hours
```

## 🚀 What Each Configuration Includes

### Local Kind (FREE)
- ✅ Full Kubernetes cluster
- ✅ All 5 microservices
- ✅ PostgreSQL & Redis
- ✅ Nginx Ingress
- ✅ Same API endpoints
- ✅ No internet required
- ❌ Not publicly accessible
- ❌ No AWS features (S3, SQS, etc.)

**Command:**
```bash
kubectl get pods -n finance-platform
curl http://localhost:8080/api/auth/health
```

### Minimal AWS ($0.60 for 5hrs)
- ✅ Real AWS infrastructure
- ✅ Single t3.small node
- ✅ Public internet access
- ✅ Application Load Balancer
- ✅ ECR for images
- ⚠️ No NAT (nodes in public subnet)
- ⚠️ Single replica (not HA)
- ⚠️ In-pod databases

**Command:**
```powershell
.\scripts\deploy-aws-minimal.ps1
```

### Standard AWS ($1.90 for 5hrs)
- ✅ Production-like setup
- ✅ 2x t3.medium nodes
- ✅ Private subnets + NAT
- ✅ High availability
- ✅ RDS PostgreSQL
- ✅ ElastiCache Redis
- ✅ Auto-scaling ready

**Command:**
```powershell
.\scripts\deploy-aws.ps1 -DeploymentType eks
```

## ⏰ Cost Over Time

| Duration | Local | Minimal | Standard |
|----------|-------|---------|----------|
| 1 hour | $0 | $0.12 | $0.38 |
| 5 hours | $0 | $0.60 | $1.90 |
| 8 hours | $0 | $0.96 | $3.04 |
| 24 hours | $0 | $2.88 | $9.12 |
| 1 week | $0 | $20.16 | $63.84 |
| 1 month | $0 | $86.40 | $273.60 |

## 🎓 Decision Tree

```
Need to test for 5 hours?
│
├─ Testing locally? → Use Kind ($0) ⭐
│
├─ Need AWS features?
│  │
│  ├─ Just testing? → Minimal ($0.60)
│  │
│  └─ Production demo? → Standard ($1.90)
│
└─ Long-term (weeks)? → Consider ECS ($106/month)
```

## 🛡️ Cost Protection Tips

### 1. Set AWS Budget Alert
```bash
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget '{
    "BudgetName": "EKS-5hr-Test",
    "BudgetLimit": {"Amount": "2", "Unit": "USD"},
    "TimeUnit": "DAILY",
    "BudgetType": "COST"
  }'
```

### 2. Set Reminder to Cleanup
```bash
# Windows (PowerShell)
$time = (Get-Date).AddHours(5)
schtasks /create /tn "AWS Cleanup Reminder" /tr "msg %username% 'Clean up AWS resources!'" /sc once /st $time.ToString("HH:mm")

# Linux/Mac
echo "cd ~/project && terraform destroy" | at now + 5 hours
```

### 3. Tag Everything
```bash
# All resources are tagged with:
Project=finance-platform
Environment=dev-minimal
ManagedBy=terraform

# Find your costs in AWS Cost Explorer by filtering on these tags
```

## 📝 Cleanup Checklist

After your 5-hour session:

```bash
# 1. Delete Kubernetes resources
kubectl delete namespace finance-platform

# 2. Destroy Terraform infrastructure
cd infrastructure/terraform
terraform destroy

# 3. Verify cleanup
aws eks list-clusters --region ap-south-1
aws ec2 describe-instances --filters "Name=tag:Project,Values=finance-platform" --region ap-south-1

# 4. Check ECR (images cost storage)
aws ecr describe-repositories --region ap-south-1

# 5. Delete ECR if done
aws ecr delete-repository --repository-name finance-platform/dev/auth-service --force --region ap-south-1
```

## 🆘 Emergency Stop (Something's Wrong!)

```bash
# Immediately stop all compute
kubectl scale deployment --all --replicas=0 -n finance-platform
kubectl delete namespace finance-platform

# Then investigate before running terraform destroy
aws ec2 describe-instances --region ap-south-1
terraform state list
```

## 📞 Support

Questions about costs?
- Check: [COST_OPTIMIZATION.md](infrastructure/COST_OPTIMIZATION.md)
- AWS Cost Explorer: https://console.aws.amazon.com/cost-management/
- Calculator: https://calculator.aws/

---

**Remember:** Your local Kind setup is FREE and already working perfectly for development! ⭐

Only use AWS when you specifically need:
- Public internet access
- AWS-specific services (S3, SQS, RDS)
- Production-like environment
- Demonstrating to stakeholders
