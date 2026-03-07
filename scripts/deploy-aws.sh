#!/bin/bash

# =============================================================
# AWS Deployment Script for Finance Platform
# Supports both ECS and EKS deployment paths
# =============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
export AWS_REGION="${AWS_REGION:-ap-south-1}"
export PROJECT_NAME="finance-platform"
export ENVIRONMENT="${ENVIRONMENT:-dev}"

# Detect deployment type
DEPLOYMENT_TYPE="${1:-eks}"  # eks or ecs

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Finance Platform AWS Deployment${NC}"
echo -e "${GREEN}Deployment Type: ${DEPLOYMENT_TYPE}${NC}"
echo -e "${GREEN}========================================${NC}"

# Function to check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"
    
    local missing=0
    
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}✗ AWS CLI not found${NC}"
        missing=1
    else
        echo -e "${GREEN}✓ AWS CLI installed${NC}"
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker not found${NC}"
        missing=1
    else
        echo -e "${GREEN}✓ Docker installed${NC}"
    fi
    
    if [ "$DEPLOYMENT_TYPE" == "eks" ]; then
        if ! command -v kubectl &> /dev/null; then
            echo -e "${RED}✗ kubectl not found${NC}"
            missing=1
        else
            echo -e "${GREEN}✓ kubectl installed${NC}"
        fi
        
        if ! command -v terraform &> /dev/null; then
            echo -e "${RED}✗ Terraform not found${NC}"
            missing=1
        else
            echo -e "${GREEN}✓ Terraform installed${NC}"
        fi
        
        if ! command -v helm &> /dev/null; then
            echo -e "${RED}✗ Helm not found${NC}"
            missing=1
        else
            echo -e "${GREEN}✓ Helm installed${NC}"
        fi
    fi
    
    if [ $missing -eq 1 ]; then
        echo -e "\n${RED}Missing required tools. Please install them first.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}All prerequisites met!${NC}"
}

# Get AWS Account ID
get_aws_account_id() {
    export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        echo -e "${RED}Failed to get AWS Account ID. Check AWS credentials.${NC}"
        exit 1
    fi
    echo -e "${GREEN}AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"
}

# Create ECR repositories
create_ecr_repos() {
    echo -e "\n${YELLOW}Creating ECR repositories...${NC}"
    
    SERVICES=("auth-service" "upload-service" "processing-service" "analytics-service" "notification-service")
    
    for service in "${SERVICES[@]}"; do
        REPO_NAME="${PROJECT_NAME}/${ENVIRONMENT}/${service}"
        
        if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$AWS_REGION" &> /dev/null; then
            echo -e "${YELLOW}Repository $REPO_NAME already exists${NC}"
        else
            aws ecr create-repository \
                --repository-name "$REPO_NAME" \
                --image-scanning-configuration scanOnPush=true \
                --encryption-configuration encryptionType=AES256 \
                --region "$AWS_REGION" > /dev/null
            echo -e "${GREEN}✓ Created $REPO_NAME${NC}"
            
            # Set lifecycle policy
            aws ecr put-lifecycle-policy \
                --repository-name "$REPO_NAME" \
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
        fi
    done
}

# Build and push images
build_and_push_images() {
    echo -e "\n${YELLOW}Building and pushing Docker images...${NC}"
    
    # Login to ECR
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin \
        "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    SERVICES=("auth-service:3001" "upload-service:3002" "processing-service:3003" "analytics-service:3004" "notification-service:3005")
    
    for service_port in "${SERVICES[@]}"; do
        IFS=':' read -r service port <<< "$service_port"
        
        echo -e "\n${YELLOW}Building ${service}...${NC}"
        
        REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}/${ENVIRONMENT}/${service}"
        GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
        
        docker build \
            --build-arg SERVICE_NAME="${service}" \
            --build-arg PORT="${port}" \
            -f "apps/${service}/Dockerfile" \
            -t "${REPO}:${GIT_SHA}" \
            -t "${REPO}:latest" \
            . || { echo -e "${RED}Failed to build ${service}${NC}"; exit 1; }
        
        echo -e "${YELLOW}Pushing ${service}...${NC}"
        docker push "${REPO}:${GIT_SHA}"
        docker push "${REPO}:latest"
        
        echo -e "${GREEN}✓ ${service} pushed successfully${NC}"
    done
}

# Deploy with Terraform (EKS)
deploy_terraform() {
    echo -e "\n${YELLOW}Deploying infrastructure with Terraform...${NC}"
    
    cd infrastructure/terraform
    
    if [ ! -f "terraform.tfvars" ]; then
        echo -e "${YELLOW}Creating terraform.tfvars...${NC}"
        cat > terraform.tfvars <<EOF
aws_region           = "${AWS_REGION}"
project_name         = "${PROJECT_NAME}"
environment          = "${ENVIRONMENT}"
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
    fi
    
    terraform init
    terraform plan -out=tfplan
    
    echo -e "${YELLOW}Ready to apply Terraform. This will create AWS resources.${NC}"
    read -p "Continue? (yes/no): " confirm
    
    if [ "$confirm" == "yes" ]; then
        terraform apply tfplan
        echo -e "${GREEN}✓ Infrastructure deployed${NC}"
    else
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
    
    cd ../..
}

# Configure kubectl for EKS
configure_kubectl() {
    echo -e "\n${YELLOW}Configuring kubectl...${NC}"
    
    aws eks update-kubeconfig \
        --name "${PROJECT_NAME}-${ENVIRONMENT}" \
        --region "$AWS_REGION"
    
    echo -e "${GREEN}✓ kubectl configured${NC}"
    kubectl get nodes
}

# Install AWS Load Balancer Controller
install_alb_controller() {
    echo -e "\n${YELLOW}Installing AWS Load Balancer Controller...${NC}"
    
    # Download IAM policy
    curl -o /tmp/iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
    
    # Create policy (ignore if exists)
    aws iam create-policy \
        --policy-name AWSLoadBalancerControllerIAMPolicy \
        --policy-document file:///tmp/iam_policy.json 2>/dev/null || echo "Policy already exists"
    
    # Create service account
    eksctl create iamserviceaccount \
        --cluster="${PROJECT_NAME}-${ENVIRONMENT}" \
        --namespace=kube-system \
        --name=aws-load-balancer-controller \
        --role-name="${PROJECT_NAME}-${ENVIRONMENT}-alb-controller" \
        --attach-policy-arn="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy" \
        --approve \
        --region="$AWS_REGION" \
        --override-existing-serviceaccounts
    
    # Install via Helm
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    
    VPC_ID=$(aws eks describe-cluster --name "${PROJECT_NAME}-${ENVIRONMENT}" --region "$AWS_REGION" --query 'cluster.resourcesVpcConfig.vpcId' --output text)
    
    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
        -n kube-system \
        --set clusterName="${PROJECT_NAME}-${ENVIRONMENT}" \
        --set serviceAccount.create=false \
        --set serviceAccount.name=aws-load-balancer-controller \
        --set region="$AWS_REGION" \
        --set vpcId="$VPC_ID"
    
    echo -e "${GREEN}✓ ALB Controller installed${NC}"
}

# Deploy to Kubernetes
deploy_to_k8s() {
    echo -e "\n${YELLOW}Deploying to Kubernetes...${NC}"
    
    # Create namespace
    kubectl create namespace finance-platform --dry-run=client -o yaml | kubectl apply -f -
    
    # Update manifests with ECR registry
    REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    for service in auth-service upload-service processing-service analytics-service notification-service; do
        sed -i.bak "s|REPLACE_WITH_ECR/${service}:latest|${REGISTRY}/${PROJECT_NAME}/${ENVIRONMENT}/${service}:latest|g" \
            "infrastructure/k8s/${service}/all.yaml"
    done
    
    # Apply manifests
    kubectl apply -f infrastructure/k8s/auth-service/all.yaml
    kubectl apply -f infrastructure/k8s/upload-service/all.yaml
    kubectl apply -f infrastructure/k8s/processing-service/all.yaml
    kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
    kubectl apply -f infrastructure/k8s/notification-service/all.yaml
    kubectl apply -f infrastructure/k8s/base/ingress.yaml
    
    echo -e "${GREEN}✓ Deployed to Kubernetes${NC}"
    
    # Wait for deployments
    echo -e "\n${YELLOW}Waiting for deployments...${NC}"
    kubectl rollout status deployment/auth-service -n finance-platform
    kubectl rollout status deployment/upload-service -n finance-platform
    kubectl rollout status deployment/processing-service -n finance-platform
    kubectl rollout status deployment/analytics-service -n finance-platform
    kubectl rollout status deployment/notification-service -n finance-platform
}

# Show deployment info
show_deployment_info() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    if [ "$DEPLOYMENT_TYPE" == "eks" ]; then
        echo -e "\n${YELLOW}Cluster Info:${NC}"
        kubectl cluster-info
        
        echo -e "\n${YELLOW}Pods:${NC}"
        kubectl get pods -n finance-platform
        
        echo -e "\n${YELLOW}Services:${NC}"
        kubectl get svc -n finance-platform
        
        echo -e "\n${YELLOW}Ingress:${NC}"
        kubectl get ingress -n finance-platform
        
        ALB_DNS=$(kubectl get ingress finance-platform-ingress -n finance-platform -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "Not ready yet")
        echo -e "\n${GREEN}ALB DNS: ${ALB_DNS}${NC}"
        echo -e "\n${YELLOW}Test endpoints:${NC}"
        echo -e "  curl http://${ALB_DNS}/api/v1/auth/health"
    fi
    
    echo -e "\n${GREEN}Next steps:${NC}"
    echo -e "  1. Configure DNS (CNAME to ALB)"
    echo -e "  2. Set up SSL certificate"
    echo -e "  3. Configure GitHub Actions secrets"
    echo -e "  4. Run database migrations"
    echo -e "\n${YELLOW}See DEPLOYMENT_GUIDE.md for detailed instructions${NC}"
}

# Main execution
main() {
    check_prerequisites
    get_aws_account_id
    create_ecr_repos
    build_and_push_images
    
    if [ "$DEPLOYMENT_TYPE" == "eks" ]; then
        deploy_terraform
        configure_kubectl
        install_alb_controller
        deploy_to_k8s
    elif [ "$DEPLOYMENT_TYPE" == "ecs" ]; then
        echo -e "${YELLOW}ECS deployment coming soon. Use manual steps from DEPLOYMENT_GUIDE.md${NC}"
        exit 0
    else
        echo -e "${RED}Invalid deployment type. Use 'eks' or 'ecs'${NC}"
        exit 1
    fi
    
    show_deployment_info
}

# Run main function
main
