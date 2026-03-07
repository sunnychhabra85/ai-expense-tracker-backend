# =============================================================
# AWS Deployment Script for Finance Platform (PowerShell)
# Supports both ECS and EKS deployment paths
# =============================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("eks", "ecs")]
    [string]$DeploymentType = "eks",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "ap-south-1",
    
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

# Configuration
$ProjectName = "finance-platform"
$Services = @(
    @{Name="auth-service"; Port=3001},
    @{Name="upload-service"; Port=3002},
    @{Name="processing-service"; Port=3003},
    @{Name="analytics-service"; Port=3004},
    @{Name="notification-service"; Port=3005}
)

Write-Host "========================================" -ForegroundColor Green
Write-Host "Finance Platform AWS Deployment" -ForegroundColor Green
Write-Host "Deployment Type: $DeploymentType" -ForegroundColor Green
Write-Host "Region: $Region" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Function to check prerequisites
function Test-Prerequisites {
    Write-Host "`nChecking prerequisites..." -ForegroundColor Yellow
    
    $missing = $false
    
    # Check AWS CLI
    if (Get-Command aws -ErrorAction SilentlyContinue) {
        Write-Host "✓ AWS CLI installed" -ForegroundColor Green
    } else {
        Write-Host "✗ AWS CLI not found" -ForegroundColor Red
        $missing = $true
    }
    
    # Check Docker
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "✓ Docker installed" -ForegroundColor Green
    } else {
        Write-Host "✗ Docker not found" -ForegroundColor Red
        $missing = $true
    }
    
    if ($DeploymentType -eq "eks") {
        # Check kubectl
        if (Get-Command kubectl -ErrorAction SilentlyContinue) {
            Write-Host "✓ kubectl installed" -ForegroundColor Green
        } else {
            Write-Host "✗ kubectl not found" -ForegroundColor Red
            $missing = $true
        }
        
        # Check Terraform
        if (Get-Command terraform -ErrorAction SilentlyContinue) {
            Write-Host "✓ Terraform installed" -ForegroundColor Green
        } else {
            Write-Host "✗ Terraform not found" -ForegroundColor Red
            $missing = $true
        }
        
        # Check Helm
        if (Get-Command helm -ErrorAction SilentlyContinue) {
            Write-Host "✓ Helm installed" -ForegroundColor Green
        } else {
            Write-Host "✗ Helm not found" -ForegroundColor Red
            $missing = $true
        }
    }
    
    if ($missing) {
        Write-Host "`nMissing required tools. Please install them first." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "All prerequisites met!" -ForegroundColor Green
}

# Get AWS Account ID
function Get-AwsAccountId {
    Write-Host "`nGetting AWS Account ID..." -ForegroundColor Yellow
    $accountId = aws sts get-caller-identity --query Account --output text
    
    if (-not $accountId) {
        Write-Host "Failed to get AWS Account ID. Check AWS credentials." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "AWS Account ID: $accountId" -ForegroundColor Green
    return $accountId
}

# Create ECR repositories
function New-EcrRepositories {
    param([string]$AccountId)
    
    Write-Host "`nCreating ECR repositories..." -ForegroundColor Yellow
    
    foreach ($service in $Services) {
        $repoName = "$ProjectName/$Environment/$($service.Name)"
        
        $exists = aws ecr describe-repositories --repository-names $repoName --region $Region 2>$null
        
        if ($exists) {
            Write-Host "Repository $repoName already exists" -ForegroundColor Yellow
        } else {
            aws ecr create-repository `
                --repository-name $repoName `
                --image-scanning-configuration scanOnPush=true `
                --encryption-configuration encryptionType=AES256 `
                --region $Region | Out-Null
            
            Write-Host "✓ Created $repoName" -ForegroundColor Green
            
            # Set lifecycle policy
            $lifecyclePolicy = @'
{
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
}
'@
            
            $lifecyclePolicy | aws ecr put-lifecycle-policy `
                --repository-name $repoName `
                --lifecycle-policy-text file:///dev/stdin `
                --region $Region | Out-Null
        }
    }
}

# Build and push images
function Build-AndPushImages {
    param([string]$AccountId)
    
    Write-Host "`nBuilding and pushing Docker images..." -ForegroundColor Yellow
    
    # Login to ECR
    aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"
    
    $gitSha = git rev-parse --short HEAD 2>$null
    if (-not $gitSha) { $gitSha = "latest" }
    
    foreach ($service in $Services) {
        Write-Host "`nBuilding $($service.Name)..." -ForegroundColor Yellow
        
        $repo = "$AccountId.dkr.ecr.$Region.amazonaws.com/$ProjectName/$Environment/$($service.Name)"
        
        docker build `
            --build-arg SERVICE_NAME=$($service.Name) `
            --build-arg PORT=$($service.Port) `
            -f "apps/$($service.Name)/Dockerfile" `
            -t "${repo}:${gitSha}" `
            -t "${repo}:latest" `
            .
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to build $($service.Name)" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "Pushing $($service.Name)..." -ForegroundColor Yellow
        docker push "${repo}:${gitSha}"
        docker push "${repo}:latest"
        
        Write-Host "✓ $($service.Name) pushed successfully" -ForegroundColor Green
    }
}

# Deploy with Terraform
function Deploy-WithTerraform {
    Write-Host "`nDeploying infrastructure with Terraform..." -ForegroundColor Yellow
    
    Push-Location infrastructure/terraform
    
    if (-not (Test-Path "terraform.tfvars")) {
        Write-Host "Creating terraform.tfvars..." -ForegroundColor Yellow
        
        $tfvars = @"
aws_region           = "$Region"
project_name         = "$ProjectName"
environment          = "$Environment"
vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
kubernetes_version   = "1.28"
node_instance_types  = ["t3.medium"]
desired_size         = 2
min_size             = 1
max_size             = 4
service_names        = ["auth-service", "upload-service", "processing-service", "analytics-service", "notification-service"]
"@
        
        $tfvars | Out-File -FilePath "terraform.tfvars" -Encoding UTF8
    }
    
    terraform init
    terraform plan -out=tfplan
    
    $confirm = Read-Host "Ready to apply Terraform. Continue? (yes/no)"
    
    if ($confirm -eq "yes") {
        terraform apply tfplan
        Write-Host "✓ Infrastructure deployed" -ForegroundColor Green
    } else {
        Write-Host "Deployment cancelled" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
}

# Configure kubectl
function Set-KubectlConfig {
    Write-Host "`nConfiguring kubectl..." -ForegroundColor Yellow
    
    aws eks update-kubeconfig `
        --name "$ProjectName-$Environment" `
        --region $Region
    
    Write-Host "✓ kubectl configured" -ForegroundColor Green
    kubectl get nodes
}

# Install ALB Controller
function Install-AlbController {
    param([string]$AccountId)
    
    Write-Host "`nInstalling AWS Load Balancer Controller..." -ForegroundColor Yellow
    
    # Download IAM policy
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json" -OutFile "$env:TEMP/iam_policy.json"
    
    # Create policy
    aws iam create-policy `
        --policy-name AWSLoadBalancerControllerIAMPolicy `
        --policy-document "file://$env:TEMP/iam_policy.json" 2>$null
    
    # Create service account
    eksctl create iamserviceaccount `
        --cluster="$ProjectName-$Environment" `
        --namespace=kube-system `
        --name=aws-load-balancer-controller `
        --role-name="$ProjectName-$Environment-alb-controller" `
        --attach-policy-arn="arn:aws:iam::${AccountId}:policy/AWSLoadBalancerControllerIAMPolicy" `
        --approve `
        --region=$Region `
        --override-existing-serviceaccounts
    
    # Install via Helm
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    
    $vpcId = aws eks describe-cluster --name "$ProjectName-$Environment" --region $Region --query 'cluster.resourcesVpcConfig.vpcId' --output text
    
    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller `
        -n kube-system `
        --set clusterName="$ProjectName-$Environment" `
        --set serviceAccount.create=false `
        --set serviceAccount.name=aws-load-balancer-controller `
        --set region=$Region `
        --set vpcId=$vpcId
    
    Write-Host "✓ ALB Controller installed" -ForegroundColor Green
}

# Deploy to Kubernetes
function Deploy-ToKubernetes {
    param([string]$AccountId)
    
    Write-Host "`nDeploying to Kubernetes..." -ForegroundColor Yellow
    
    # Create namespace
    kubectl create namespace finance-platform --dry-run=client -o yaml | kubectl apply -f -
    
    # Update manifests
    $registry = "$AccountId.dkr.ecr.$Region.amazonaws.com"
    
    foreach ($service in $Services) {
        $manifestPath = "infrastructure/k8s/$($service.Name)/all.yaml"
        (Get-Content $manifestPath) -replace "REPLACE_WITH_ECR/$($service.Name):latest", "$registry/$ProjectName/$Environment/$($service.Name):latest" | Set-Content $manifestPath
    }
    
    # Apply manifests
    kubectl apply -f infrastructure/k8s/auth-service/all.yaml
    kubectl apply -f infrastructure/k8s/upload-service/all.yaml
    kubectl apply -f infrastructure/k8s/processing-service/all.yaml
    kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
    kubectl apply -f infrastructure/k8s/notification-service/all.yaml
    kubectl apply -f infrastructure/k8s/base/ingress.yaml
    
    Write-Host "✓ Deployed to Kubernetes" -ForegroundColor Green
    
    # Wait for deployments
    Write-Host "`nWaiting for deployments..." -ForegroundColor Yellow
    kubectl rollout status deployment/auth-service -n finance-platform
    kubectl rollout status deployment/upload-service -n finance-platform
    kubectl rollout status deployment/processing-service -n finance-platform
    kubectl rollout status deployment/analytics-service -n finance-platform
    kubectl rollout status deployment/notification-service -n finance-platform
}

# Show deployment info
function Show-DeploymentInfo {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Deployment Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    
    if ($DeploymentType -eq "eks") {
        Write-Host "`nCluster Info:" -ForegroundColor Yellow
        kubectl cluster-info
        
        Write-Host "`nPods:" -ForegroundColor Yellow
        kubectl get pods -n finance-platform
        
        Write-Host "`nServices:" -ForegroundColor Yellow
        kubectl get svc -n finance-platform
        
        Write-Host "`nIngress:" -ForegroundColor Yellow
        kubectl get ingress -n finance-platform
        
        $albDns = kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>$null
        if (-not $albDns) { $albDns = "Not ready yet" }
        
        Write-Host "`nALB DNS: $albDns" -ForegroundColor Green
        Write-Host "`nTest endpoints:" -ForegroundColor Yellow
        Write-Host "  curl http://$albDns/api/v1/auth/health"
    }
    
    Write-Host "`nNext steps:" -ForegroundColor Green
    Write-Host "  1. Configure DNS (CNAME to ALB)"
    Write-Host "  2. Set up SSL certificate"
    Write-Host "  3. Configure GitHub Actions secrets"
    Write-Host "  4. Run database migrations"
    Write-Host "`nSee DEPLOYMENT_GUIDE.md for detailed instructions" -ForegroundColor Yellow
}

# Main execution
try {
    Test-Prerequisites
    $accountId = Get-AwsAccountId
    New-EcrRepositories -AccountId $accountId
    Build-AndPushImages -AccountId $accountId
    
    if ($DeploymentType -eq "eks") {
        Deploy-WithTerraform
        Set-KubectlConfig
        Install-AlbController -AccountId $accountId
        Deploy-ToKubernetes -AccountId $accountId
    }
    elseif ($DeploymentType -eq "ecs") {
        Write-Host "ECS deployment coming soon. Use manual steps from DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
        exit 0
    }
    
    Show-DeploymentInfo
}
catch {
    Write-Host "`nDeployment failed: $_" -ForegroundColor Red
    exit 1
}
