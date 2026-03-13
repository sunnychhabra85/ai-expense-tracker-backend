#!/bin/bash

#######################################################
# Quick AWS Free Tier Deployment Script
# This script automates Steps 2-3 of the deployment guide
# Usage: bash scripts/deploy-to-aws.sh
#######################################################

set -e

echo "========================================="
echo "Finance Platform - AWS Deployment Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found. Installing...${NC}"
    sudo yum install -y jq || sudo apt-get install -y jq
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo ""

# Get user input
read -p "Enter AWS region (default: us-east-1): " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

read -p "Enter your email for notifications: " USER_EMAIL
[ -z "$USER_EMAIL" ] && echo "Email is required" && exit 1

read -p "Enter your domain (or press Enter to skip): " DOMAIN_NAME

echo ""
echo "========================================="
echo "Creating AWS Resources"
echo "========================================="
echo ""

#--------------------------------------------------
# Step 1: Create S3 Bucket
#--------------------------------------------------
echo "[1/6] Creating S3 bucket..."
BUCKET_NAME="finance-platform-$(date +%s)"

aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION

aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET_NAME \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "DeleteOldFiles",
      "Status": "Enabled",
      "Expiration": {"Days": 90}
    }]
  }'

echo -e "${GREEN}✅ S3 bucket created: $BUCKET_NAME${NC}"

#--------------------------------------------------
# Step 2: Create SQS Queue
#--------------------------------------------------
echo ""
echo "[2/6] Creating SQS queue..."

QUEUE_URL=$(aws sqs create-queue \
  --queue-name document-processing \
  --region $AWS_REGION \
  --query 'QueueUrl' \
  --output text)

echo -e "${GREEN}✅ SQS queue created: $QUEUE_URL${NC}"

#--------------------------------------------------
# Step 3: Create IAM User
#--------------------------------------------------
echo ""
echo "[3/6] Creating IAM user and policies..."

# Create user
aws iam create-user --user-name finance-platform-app 2>/dev/null || echo "User already exists"

# Create policy JSON
cat > /tmp/app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${BUCKET_NAME}/*",
        "arn:aws:s3:::${BUCKET_NAME}"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:${AWS_REGION}:${AWS_ACCOUNT_ID}:document-processing"
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Attach policy
aws iam put-user-policy \
  --user-name finance-platform-app \
  --policy-name FinancePlatformPolicy \
  --policy-document file:///tmp/app-policy.json

# Create access keys
aws iam create-access-key --user-name finance-platform-app > /tmp/app-credentials.json 2>/dev/null || true

APP_ACCESS_KEY=$(cat /tmp/app-credentials.json | jq -r '.AccessKey.AccessKeyId')
APP_SECRET_KEY=$(cat /tmp/app-credentials.json | jq -r '.AccessKey.SecretAccessKey')

echo -e "${GREEN}✅ IAM user created with access keys${NC}"

#--------------------------------------------------
# Step 4: Create Security Group
#--------------------------------------------------
echo ""
echo "[4/6] Creating security group..."

SG_ID=$(aws ec2 create-security-group \
  --group-name finance-platform-sg \
  --description "Security group for Finance Platform" \
  --region $AWS_REGION \
  --query 'GroupId' \
  --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values=finance-platform-sg \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region $AWS_REGION)

# Add rules
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0 \
  --region $AWS_REGION 2>/dev/null || true

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region $AWS_REGION 2>/dev/null || true

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region $AWS_REGION 2>/dev/null || true

echo -e "${GREEN}✅ Security group created: $SG_ID${NC}"

#--------------------------------------------------
# Step 5: Create Key Pair
#--------------------------------------------------
echo ""
echo "[5/6] Creating key pair..."

KEY_NAME="finance-platform-key"
KEY_FILE="${KEY_NAME}.pem"

if [ -f "$KEY_FILE" ]; then
    echo "Key file already exists. Using existing key."
else
    aws ec2 create-key-pair \
      --key-name $KEY_NAME \
      --query 'KeyMaterial' \
      --output text \
      --region $AWS_REGION > $KEY_FILE
    
    chmod 400 $KEY_FILE
    echo -e "${GREEN}✅ Key pair created: $KEY_FILE${NC}"
fi

#--------------------------------------------------
# Step 6: Launch EC2 Instance
#--------------------------------------------------
echo ""
echo "[6/6] Launching EC2 instance..."

# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' \
            'Name=state,Values=available' \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text \
  --region $AWS_REGION)

echo "Using AMI: $AMI_ID"

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t2.micro \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=finance-platform}]' \
  --region $AWS_REGION \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance launching: $INSTANCE_ID"
echo "Waiting for instance to be running..."

aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $AWS_REGION

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text \
  --region $AWS_REGION)

echo -e "${GREEN}✅ EC2 instance created and running${NC}"

#--------------------------------------------------
# Generate .env.production file
#--------------------------------------------------
echo ""
echo "Generating .env.production file..."

cat > .env.production.generated <<EOF
# Generated by deploy-to-aws.sh on $(date)

NODE_ENV=production

# Database
POSTGRES_DB=financedb
POSTGRES_USER=admin
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# JWT Secrets
JWT_ACCESS_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_PASSWORD=$(openssl rand -base64 24)

# AWS
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${APP_ACCESS_KEY}
AWS_SECRET_ACCESS_KEY=${APP_SECRET_KEY}
AWS_S3_BUCKET=${BUCKET_NAME}
AWS_SQS_PROCESSING_URL=${QUEUE_URL}

# OpenAI (Add your key)
OPENAI_API_KEY=

# CORS
ALLOWED_ORIGINS=http://${PUBLIC_IP}$([ -n "$DOMAIN_NAME" ] && echo ",https://${DOMAIN_NAME}")

# Application
BCRYPT_ROUNDS=10
EOF

echo -e "${GREEN}✅ Environment file generated: .env.production.generated${NC}"

#--------------------------------------------------
# Generate deployment summary
#--------------------------------------------------
echo ""
echo "========================================="
echo "🎉 AWS Resources Created Successfully!"
echo "========================================="
echo ""
echo "📋 DEPLOYMENT SUMMARY"
echo "----------------------------------------"
echo "EC2 Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo "SSH Key: $KEY_FILE"
echo "Security Group: $SG_ID"
echo ""
echo "S3 Bucket: $BUCKET_NAME"
echo "SQS Queue: $QUEUE_URL"
echo "IAM User: finance-platform-app"
echo ""
echo "========================================="
echo "📝 NEXT STEPS"
echo "========================================="
echo ""
echo "1. Connect to EC2:"
echo "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP"
echo ""
echo "2. On EC2, clone your repository:"
echo "   sudo yum update -y"
echo "   sudo yum install -y git"
echo "   cd /opt"
echo "   sudo git clone YOUR_REPO_URL finance-platform"
echo "   cd finance-platform"
echo ""
echo "3. Copy the generated .env file to EC2:"
echo "   scp -i $KEY_FILE .env.production.generated ec2-user@$PUBLIC_IP:/tmp/"
echo "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP"
echo "   sudo mv /tmp/.env.production.generated /opt/finance-platform/.env.production"
echo ""
echo "4. Run the setup script on EC2:"
echo "   cd /opt/finance-platform"
echo "   sudo bash scripts/ec2-setup.sh"
echo ""
echo "5. Deploy the application:"
echo "   sudo docker-compose -f docker-compose.production.yml up -d --build"
echo ""
echo "6. Access your application:"
echo "   http://$PUBLIC_IP"
echo ""
echo "========================================="
echo ""
echo "⚠️  IMPORTANT: Save these credentials securely!"
echo "    - $KEY_FILE (SSH key)"
echo "    - .env.production.generated (environment variables)"
echo "    - /tmp/app-credentials.json (AWS access keys)"
echo ""
echo "Complete deployment guide: AWS_FREE_TIER_DEPLOYMENT.md"
echo ""

# Save summary to file
cat > deployment-summary.txt <<EOF
Finance Platform Deployment Summary
Generated: $(date)

EC2 Instance ID: $INSTANCE_ID
Public IP: $PUBLIC_IP
SSH Key: $KEY_FILE
Security Group: $SG_ID
Region: $AWS_REGION

S3 Bucket: $BUCKET_NAME
SQS Queue: $QUEUE_URL
IAM User: finance-platform-app

SSH Command:
ssh -i $KEY_FILE ec2-user@$PUBLIC_IP

Application URL:
http://$PUBLIC_IP

For complete setup instructions, see: AWS_FREE_TIER_DEPLOYMENT.md
EOF

echo -e "${GREEN}✅ Deployment summary saved to: deployment-summary.txt${NC}"
echo ""
