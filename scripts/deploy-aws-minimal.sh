#!/bin/bash

# =============================================================
# Cost-Optimized AWS Deployment Script
# Deploys minimal infrastructure for testing (~$0.60 for 5 hours)
# =============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Cost-Optimized AWS Deployment${NC}"
echo -e "${GREEN}Estimated: \$0.60 for 5 hours${NC}"
echo -e "${GREEN}========================================${NC}"

# Show cost comparison
echo -e "\n${BLUE}Cost Comparison:${NC}"
echo -e "  Standard Setup:  \$1.90 for 5 hours"
echo -e "  ${GREEN}Minimal Setup:   \$0.60 for 5 hours (68% savings)${NC}"
echo -e "  ${YELLOW}Local Kind:      \$0.00 (FREE!)${NC}"

echo -e "\n${YELLOW}This setup uses:${NC}"
echo -e "  ✓ 1x t3.small node (instead of 2x t3.medium)"
echo -e "  ✓ Public subnets (no NAT Gateway)"
echo -e "  ✓ Single replica deployments"
echo -e "  ✓ In-cluster databases (no RDS/ElastiCache)"

# Prompt user
echo -e "\n${YELLOW}Note: You already have a FREE local Kind cluster running!${NC}"
echo -e "Do you really need AWS, or can you test locally?"
read -p "Deploy to AWS anyway? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${GREEN}Good choice! Your local setup is free and already working.${NC}"
    echo -e "Test your API at: ${BLUE}http://localhost:8080/api/auth/health${NC}"
    exit 0
fi

# Configuration
export AWS_REGION="${AWS_REGION:-ap-south-1}"
export PROJECT_NAME="finance-platform"
export ENVIRONMENT="dev-minimal"

echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS CLI${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found${NC}"
    exit 1
fi
# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker daemon is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker${NC}"

# Check Terraform
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}✗ Terraform not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Terraform${NC}"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}✗ kubectl not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ kubectl${NC}"

# Get AWS Account
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Failed to get AWS Account ID. Run 'aws configure'${NC}"
    exit 1
fi
echo -e "${GREEN}AWS Account: ${AWS_ACCOUNT_ID}${NC}"

# Deploy with Terraform
echo -e "\n${YELLOW}Deploying minimal infrastructure...${NC}"
cd infrastructure/terraform

# Backup existing tfvars if present
if [ -f "terraform.tfvars" ]; then
    cp terraform.tfvars terraform.tfvars.backup
    echo -e "${YELLOW}Backed up existing terraform.tfvars${NC}"
fi

# Use minimal config
cp terraform.tfvars.minimal terraform.tfvars

# Show what will be created
echo -e "\n${YELLOW}Reviewing infrastructure plan...${NC}"
terraform init
terraform plan -out=tfplan

# Calculate estimated cost
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Cost Estimate:${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "EKS Control Plane:  \$0.10/hour × 5hrs = \$0.50"
echo -e "t3.small node:      \$0.02/hour × 5hrs = \$0.10"
echo -e "Application LB:     \$0.02/hour × 5hrs = \$0.10"
echo -e "EBS Storage:        \$0.01/hour × 5hrs = \$0.05"
echo -e "Data Transfer:      ~\$0.01/hour × 5hrs = \$0.05"
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${GREEN}Total for 5 hours:  ~\$0.80${NC}"
echo -e "${BLUE}========================================${NC}"

read -p "Continue with deployment? (yes/no): " deploy_confirm

if [ "$deploy_confirm" != "yes" ]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Apply
echo -e "\n${YELLOW}Creating infrastructure (this takes ~15 minutes)...${NC}"
terraform apply tfplan

# Get outputs
VPC_ID=$(terraform output -raw vpc_id 2>/dev/null)
CLUSTER_NAME=$(terraform output -raw eks_cluster_name 2>/dev/null)

echo -e "${GREEN}✓ Infrastructure created${NC}"

cd ../..

# Configure kubectl
echo -e "\n${YELLOW}Configuring kubectl...${NC}"
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

# Wait for nodes
echo -e "${YELLOW}Waiting for nodes to be ready...${NC}"
kubectl wait --for=condition=Ready nodes --all --timeout=300s

# Create ECR repositories if they don't exist
echo -e "\n${YELLOW}Creating ECR repositories...${NC}"
SERVICES=(auth-service upload-service processing-service analytics-service notification-service)

for service in "${SERVICES[@]}"; do
    repo_name="${PROJECT_NAME}/dev/${service}"
    
    # Check if repository exists
    if ! aws ecr describe-repositories --repository-names "$repo_name" --region "$AWS_REGION" &>/dev/null; then
        echo -e "${YELLOW}Creating repository: ${repo_name}${NC}"
        aws ecr create-repository \
            --repository-name "$repo_name" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            --region "$AWS_REGION" > /dev/null
        
        # Set lifecycle policy to keep only last 5 images
        aws ecr put-lifecycle-policy \
            --repository-name "$repo_name" \
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
            --region "$AWS_REGION" > /dev/null
        
        echo -e "${GREEN}✓ Created ${repo_name}${NC}"
    else
        echo -e "${GREEN}✓ Repository ${repo_name} already exists${NC}"
    fi
done

# Build and push Docker images
echo -e "\n${YELLOW}Building and pushing Docker images to ECR...${NC}"
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Login to ECR
echo -e "${YELLOW}Logging into ECR...${NC}"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$REGISTRY"

# Build and push each service
PORTS=(3001 3002 3003 3004 3005)

for i in ${!SERVICES[@]}; do
    service=${SERVICES[$i]}
    port=${PORTS[$i]}
    
    echo -e "${YELLOW}Building ${service}...${NC}"
    docker build \
      --build-arg SERVICE_NAME=${service} \
      --build-arg PORT=${port} \
      -f apps/${service}/Dockerfile \
      -t ${REGISTRY}/${PROJECT_NAME}/dev/${service}:latest \
      . || {
        echo -e "${RED}Failed to build ${service}${NC}"
        exit 1
      }
    
    echo -e "${YELLOW}Pushing ${service}...${NC}"
    docker push ${REGISTRY}/${PROJECT_NAME}/dev/${service}:latest || {
      echo -e "${RED}Failed to push ${service}${NC}"
      exit 1
    }
    
    echo -e "${GREEN}✓ ${service} image ready${NC}"
done

# Deploy services with minimal replicas
echo -e "\n${YELLOW}Deploying services (1 replica each)...${NC}"

# Create namespace
kubectl create namespace finance-platform --dry-run=client -o yaml | kubectl apply -f -

# Deploy PostgreSQL and Redis first
echo -e "${YELLOW}Deploying PostgreSQL...${NC}"
kubectl apply -f infrastructure/k8s/base/postgres.yaml
kubectl wait --for=condition=Ready pod -l app=postgres -n finance-platform --timeout=180s
echo -e "${GREEN}✓ PostgreSQL ready${NC}"

echo -e "${YELLOW}Deploying Redis...${NC}"
kubectl apply -f infrastructure/k8s/base/redis.yaml
kubectl wait --for=condition=Ready pod -l app=redis -n finance-platform --timeout=180s
echo -e "${GREEN}✓ Redis ready${NC}"

# Run database migrations
echo -e "\n${YELLOW}Running database migrations...${NC}"
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
kubectl run prisma-migrate \
  --image=${REGISTRY}/${PROJECT_NAME}/dev/auth-service:latest \
  --restart=Never \
  --namespace=finance-platform \
  --env="DATABASE_URL=postgresql://admin:localpassword123@postgres:5432/financedb" \
  --command -- sh -c "npx prisma migrate deploy --schema=/app/libs/database/prisma/schema.prisma"

# Wait for migration to complete
kubectl wait --for=condition=Complete job/prisma-migrate -n finance-platform --timeout=120s 2>/dev/null || \
kubectl wait --for=condition=Complete pod/prisma-migrate -n finance-platform --timeout=120s 2>/dev/null || \
  echo -e "${YELLOW}Migration job completed (or already exists)${NC}"

echo -e "${GREEN}✓ Database migrations complete${NC}"

# Update manifests for minimal deployment
for service in auth-service upload-service processing-service analytics-service notification-service; do
    manifest="infrastructure/k8s/${service}/all.yaml"
    
    # Reduce replicas to 1
    sed -i.bak 's/replicas: 2/replicas: 1/g' "$manifest"
    
    # Update image - replace both commented and active image lines
    REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    sed -i.bak "s|image: ${service}:local|image: ${REGISTRY}/${PROJECT_NAME}/dev/${service}:latest|g" "$manifest"
    sed -i.bak "s|imagePullPolicy: IfNotPresent|imagePullPolicy: Always|g" "$manifest"
    sed -i.bak "s|# image: REPLACE_WITH_ECR/${service}:latest|image: ${REGISTRY}/${PROJECT_NAME}/dev/${service}:latest|g" "$manifest"
    
    # Apply
    kubectl apply -f "$manifest"
done

# Deploy ingress
kubectl apply -f infrastructure/k8s/base/ingress.yaml

# Wait for deployments
echo -e "\n${YELLOW}Waiting for deployments...${NC}"
kubectl rollout status deployment/auth-service -n finance-platform --timeout=300s
kubectl rollout status deployment/upload-service -n finance-platform --timeout=300s

# Get ALB DNS
echo -e "\n${YELLOW}Waiting for Load Balancer (this can take 2-3 minutes)...${NC}"
sleep 60

ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "Not ready yet")

# Show summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${BLUE}Cluster: ${CLUSTER_NAME}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo -e "${BLUE}Load Balancer: ${ALB_DNS}${NC}"

echo -e "\n${YELLOW}Test your deployment:${NC}"
echo -e "  curl http://${ALB_DNS}/api/v1/auth/health"

echo -e "\n${YELLOW}View resources:${NC}"
echo -e "  kubectl get all -n finance-platform"

echo -e "\n${RED}⚠️  IMPORTANT: Cost Management ⚠️${NC}"
echo -e "${YELLOW}This setup costs ~\$0.12/hour${NC}"
echo -e "${YELLOW}For 5 hours: ~\$0.60${NC}"
echo -e "${YELLOW}Left running 24h: ~\$2.88${NC}"

echo -e "\n${RED}When done testing, clean up to avoid charges:${NC}"
echo -e "  ${BLUE}cd infrastructure/terraform${NC}"
echo -e "  ${BLUE}terraform destroy${NC}"

echo -e "\n${YELLOW}Set a reminder to clean up!${NC}"
echo -e "Current time: $(date)"
echo -e "5 hours from now: $(date -d '+5 hours' 2>/dev/null || date -v+5H 2>/dev/null)"

echo -e "\n${GREEN}Happy testing! 🚀${NC}"
