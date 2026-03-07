# =============================================================
# Cost-Optimized AWS Deployment Script (PowerShell)
# Deploys minimal infrastructure for testing (~$0.60 for 5 hours)
# =============================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Cost-Optimized AWS Deployment" -ForegroundColor Green
Write-Host "Estimated: `$0.60 for 5 hours" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Show cost comparison
Write-Host "`nCost Comparison:" -ForegroundColor Blue
Write-Host "  Standard Setup:  `$1.90 for 5 hours"
Write-Host "  Minimal Setup:   `$0.60 for 5 hours (68% savings)" -ForegroundColor Green
Write-Host "  Local Kind:      `$0.00 (FREE!)" -ForegroundColor Yellow

Write-Host "`nThis setup uses:" -ForegroundColor Yellow
Write-Host "  ✓ 1x t3.small node (instead of 2x t3.medium)"
Write-Host "  ✓ Public subnets (no NAT Gateway)"
Write-Host "  ✓ Single replica deployments"
Write-Host "  ✓ In-cluster databases (no RDS/ElastiCache)"

# Prompt user
Write-Host "`nNote: You already have a FREE local Kind cluster running!" -ForegroundColor Yellow
Write-Host "Do you really need AWS, or can you test locally?"
$confirm = Read-Host "Deploy to AWS anyway? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Good choice! Your local setup is free and already working." -ForegroundColor Green
    Write-Host "Test your API at: http://localhost:8080/api/auth/health" -ForegroundColor Blue
    exit 0
}

# Configuration
$ProjectName = "finance-platform"
$Environment = "dev-minimal"

Write-Host "`nChecking prerequisites..." -ForegroundColor Yellow

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "✗ AWS CLI not found" -ForegroundColor Red
    exit 1
}
Write-Host "✓ AWS CLI" -ForegroundColor Green

# Check Terraform
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Terraform not found" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Terraform" -ForegroundColor Green

# Check kubectl
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "✗ kubectl not found" -ForegroundColor Red
    exit 1
}
Write-Host "✓ kubectl" -ForegroundColor Green

# Get AWS Account
$accountId = aws sts get-caller-identity --query Account --output text 2>$null
if (-not $accountId) {
    Write-Host "Failed to get AWS Account ID. Run 'aws configure'" -ForegroundColor Red
    exit 1
}
Write-Host "AWS Account: $accountId" -ForegroundColor Green

# Deploy with Terraform
Write-Host "`nDeploying minimal infrastructure..." -ForegroundColor Yellow
Push-Location infrastructure/terraform

# Backup existing tfvars
if (Test-Path "terraform.tfvars") {
    Copy-Item "terraform.tfvars" "terraform.tfvars.backup"
    Write-Host "Backed up existing terraform.tfvars" -ForegroundColor Yellow
}

# Use minimal config
Copy-Item "terraform.tfvars.minimal" "terraform.tfvars"

# Show plan
Write-Host "`nReviewing infrastructure plan..." -ForegroundColor Yellow
terraform init
terraform plan -out=tfplan

# Show cost estimate
Write-Host "`n========================================" -ForegroundColor Blue
Write-Host "Cost Estimate:" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host "EKS Control Plane:  `$0.10/hour × 5hrs = `$0.50"
Write-Host "t3.small node:      `$0.02/hour × 5hrs = `$0.10"
Write-Host "Application LB:     `$0.02/hour × 5hrs = `$0.10"
Write-Host "EBS Storage:        `$0.01/hour × 5hrs = `$0.05"
Write-Host "Data Transfer:      ~`$0.01/hour × 5hrs = `$0.05"
Write-Host "----------------------------------------" -ForegroundColor Blue
Write-Host "Total for 5 hours:  ~`$0.80" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Blue

$deployConfirm = Read-Host "`nContinue with deployment? (yes/no)"

if ($deployConfirm -ne "yes") {
    Write-Host "Deployment cancelled" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Apply
Write-Host "`nCreating infrastructure (this takes ~15 minutes)..." -ForegroundColor Yellow
terraform apply tfplan

# Get outputs
$clusterName = terraform output -raw eks_cluster_name 2>$null

Write-Host "✓ Infrastructure created" -ForegroundColor Green

Pop-Location

# Configure kubectl
Write-Host "`nConfiguring kubectl..." -ForegroundColor Yellow
aws eks update-kubeconfig --name $clusterName --region $Region

# Wait for nodes
Write-Host "Waiting for nodes to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=Ready nodes --all --timeout=300s

# Deploy services
Write-Host "`nDeploying services (1 replica each)..." -ForegroundColor Yellow

# Create namespace
kubectl create namespace finance-platform --dry-run=client -o yaml | kubectl apply -f -

# Update and deploy manifests
$services = @("auth-service", "upload-service", "processing-service", "analytics-service", "notification-service")

foreach ($service in $services) {
    $manifest = "infrastructure/k8s/$service/all.yaml"
    
    # Read, modify, and apply
    $content = Get-Content $manifest -Raw
    $content = $content -replace 'replicas: 2', 'replicas: 1'
    $content = $content -replace "REPLACE_WITH_ECR/$service:latest", "$accountId.dkr.ecr.$Region.amazonaws.com/$ProjectName/dev/${service}:latest"
    
    $content | kubectl apply -f -
}

# Deploy ingress
kubectl apply -f infrastructure/k8s/base/ingress.yaml

# Wait for deployments
Write-Host "`nWaiting for deployments..." -ForegroundColor Yellow
kubectl rollout status deployment/auth-service -n finance-platform --timeout=300s
kubectl rollout status deployment/upload-service -n finance-platform --timeout=300s

# Get ALB DNS
Write-Host "`nWaiting for Load Balancer (this can take 2-3 minutes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

$albDns = kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>$null
if (-not $albDns) { $albDns = "Not ready yet" }

# Show summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nCluster: $clusterName" -ForegroundColor Blue
Write-Host "Region: $Region" -ForegroundColor Blue
Write-Host "Load Balancer: $albDns" -ForegroundColor Blue

Write-Host "`nTest your deployment:" -ForegroundColor Yellow
Write-Host "  curl http://$albDns/api/v1/auth/health"

Write-Host "`nView resources:" -ForegroundColor Yellow
Write-Host "  kubectl get all -n finance-platform"

Write-Host "`n⚠️  IMPORTANT: Cost Management ⚠️" -ForegroundColor Red
Write-Host "This setup costs ~`$0.12/hour" -ForegroundColor Yellow
Write-Host "For 5 hours: ~`$0.60" -ForegroundColor Yellow
Write-Host "Left running 24h: ~`$2.88" -ForegroundColor Yellow

Write-Host "`nWhen done testing, clean up to avoid charges:" -ForegroundColor Red
Write-Host "  cd infrastructure/terraform" -ForegroundColor Blue
Write-Host "  terraform destroy" -ForegroundColor Blue

Write-Host "`nSet a reminder to clean up!" -ForegroundColor Yellow
Write-Host "Current time: $(Get-Date)"
Write-Host "5 hours from now: $((Get-Date).AddHours(5))"

Write-Host "`nHappy testing! 🚀" -ForegroundColor Green
