#######################################################
# Quick AWS Free Tier Deployment Script (PowerShell)
# This script automates Steps 2-3 of the deployment guide
# Usage: .\scripts\deploy-to-aws.ps1
#######################################################

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Finance Platform - AWS Deployment Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "❌ AWS CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green
Write-Host ""

# Get AWS account ID
$AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
Write-Host "AWS Account ID: $AWS_ACCOUNT_ID"
Write-Host ""

# Get user input
$AWS_REGION = Read-Host "Enter AWS region (default: us-east-1)"
if ([string]::IsNullOrWhiteSpace($AWS_REGION)) { $AWS_REGION = "us-east-1" }

$USER_EMAIL = Read-Host "Enter your email for notifications"
if ([string]::IsNullOrWhiteSpace($USER_EMAIL)) {
    Write-Host "Email is required" -ForegroundColor Red
    exit 1
}

$DOMAIN_NAME = Read-Host "Enter your domain (or press Enter to skip)"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Creating AWS Resources" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

#--------------------------------------------------
# Step 1: Create S3 Bucket
#--------------------------------------------------
Write-Host "[1/6] Creating S3 bucket..." -ForegroundColor Yellow
$timestamp = [System.DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$BUCKET_NAME = "finance-platform-$timestamp"

aws s3 mb "s3://$BUCKET_NAME" --region $AWS_REGION

aws s3api put-bucket-versioning `
  --bucket $BUCKET_NAME `
  --versioning-configuration Status=Enabled

$lifecycleJson = @'
{
  "Rules": [{
    "Id": "DeleteOldFiles",
    "Status": "Enabled",
    "Expiration": {"Days": 90}
  }]
}
'@
$lifecycleJson | Out-File -FilePath ".\temp-lifecycle.json" -Encoding ASCII

aws s3api put-bucket-lifecycle-configuration `
  --bucket $BUCKET_NAME `
  --lifecycle-configuration file://temp-lifecycle.json

Remove-Item ".\temp-lifecycle.json"

Write-Host "✅ S3 bucket created: $BUCKET_NAME" -ForegroundColor Green

#--------------------------------------------------
# Step 2: Create SQS Queue
#--------------------------------------------------
Write-Host ""
Write-Host "[2/6] Creating SQS queue..." -ForegroundColor Yellow

$QUEUE_URL = aws sqs create-queue `
  --queue-name document-processing `
  --region $AWS_REGION `
  --query 'QueueUrl' `
  --output text

Write-Host "✅ SQS queue created: $QUEUE_URL" -ForegroundColor Green

#--------------------------------------------------
# Step 3: Create IAM User
#--------------------------------------------------
Write-Host ""
Write-Host "[3/6] Creating IAM user and policies..." -ForegroundColor Yellow

# Create user
try {
    aws iam create-user --user-name finance-platform-app 2>$null
} catch {
    Write-Host "User already exists, continuing..." -ForegroundColor Yellow
}

# Create policy JSON
$policyJson = @"
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
"@

$policyJson | Out-File -FilePath ".\temp-policy.json" -Encoding ASCII

# Attach policy
aws iam put-user-policy `
  --user-name finance-platform-app `
  --policy-name FinancePlatformPolicy `
  --policy-document file://temp-policy.json

Remove-Item ".\temp-policy.json"

# Create access keys
try {
    aws iam create-access-key --user-name finance-platform-app > app-credentials.json 2>$null
} catch {
    Write-Host "Access key already exists, using existing..." -ForegroundColor Yellow
}

$credentials = Get-Content -Path "app-credentials.json" | ConvertFrom-Json
$APP_ACCESS_KEY = $credentials.AccessKey.AccessKeyId
$APP_SECRET_KEY = $credentials.AccessKey.SecretAccessKey

Write-Host "✅ IAM user created with access keys" -ForegroundColor Green

#--------------------------------------------------
# Step 4: Create Security Group
#--------------------------------------------------
Write-Host ""
Write-Host "[4/6] Creating security group..." -ForegroundColor Yellow

try {
    $SG_ID = aws ec2 create-security-group `
      --group-name finance-platform-sg `
      --description "Security group for Finance Platform" `
      --region $AWS_REGION `
      --query 'GroupId' `
      --output text
} catch {
    $SG_ID = aws ec2 describe-security-groups `
      --filters Name=group-name,Values=finance-platform-sg `
      --query 'SecurityGroups[0].GroupId' `
      --output text `
      --region $AWS_REGION
}

# Add rules
try {
    aws ec2 authorize-security-group-ingress `
      --group-id $SG_ID `
      --protocol tcp `
      --port 22 `
      --cidr 0.0.0.0/0 `
      --region $AWS_REGION 2>$null
} catch {}

try {
    aws ec2 authorize-security-group-ingress `
      --group-id $SG_ID `
      --protocol tcp `
      --port 80 `
      --cidr 0.0.0.0/0 `
      --region $AWS_REGION 2>$null
} catch {}

try {
    aws ec2 authorize-security-group-ingress `
      --group-id $SG_ID `
      --protocol tcp `
      --port 443 `
      --cidr 0.0.0.0/0 `
      --region $AWS_REGION 2>$null
} catch {}

Write-Host "✅ Security group created: $SG_ID" -ForegroundColor Green

#--------------------------------------------------
# Step 5: Create Key Pair
#--------------------------------------------------
Write-Host ""
Write-Host "[5/6] Creating key pair..." -ForegroundColor Yellow

$KEY_NAME = "finance-platform-key"
$KEY_FILE = "$KEY_NAME.pem"

if (Test-Path $KEY_FILE) {
    Write-Host "Key file already exists. Using existing key." -ForegroundColor Yellow
} else {
    aws ec2 create-key-pair `
      --key-name $KEY_NAME `
      --query 'KeyMaterial' `
      --output text `
      --region $AWS_REGION | Out-File -FilePath $KEY_FILE -Encoding ASCII
    
    Write-Host "✅ Key pair created: $KEY_FILE" -ForegroundColor Green
}

#--------------------------------------------------
# Step 6: Launch EC2 Instance
#--------------------------------------------------
Write-Host ""
Write-Host "[6/6] Launching EC2 instance..." -ForegroundColor Yellow

# Get latest Amazon Linux 2023 AMI
$AMI_ID = aws ec2 describe-images `
  --owners amazon `
  --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' `
            'Name=state,Values=available' `
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' `
  --output text `
  --region $AWS_REGION

Write-Host "Using AMI: $AMI_ID"

# Launch instance
$INSTANCE_ID = aws ec2 run-instances `
  --image-id $AMI_ID `
  --instance-type t2.micro `
  --key-name $KEY_NAME `
  --security-group-ids $SG_ID `
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=finance-platform}]' `
  --region $AWS_REGION `
  --query 'Instances[0].InstanceId' `
  --output text

Write-Host "Instance launching: $INSTANCE_ID"
Write-Host "Waiting for instance to be running..."

aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $AWS_REGION

$PUBLIC_IP = aws ec2 describe-instances `
  --instance-ids $INSTANCE_ID `
  --query 'Reservations[0].Instances[0].PublicIpAddress' `
  --output text `
  --region $AWS_REGION

Write-Host "✅ EC2 instance created and running" -ForegroundColor Green

#--------------------------------------------------
# Generate .env.production file
#--------------------------------------------------
Write-Host ""
Write-Host "Generating .env.production file..." -ForegroundColor Yellow

# Generate random passwords
$POSTGRES_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$JWT_ACCESS_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$JWT_REFRESH_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$REDIS_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})

$allowedOrigins = "http://$PUBLIC_IP"
if (-not [string]::IsNullOrWhiteSpace($DOMAIN_NAME)) {
    $allowedOrigins += ",https://$DOMAIN_NAME"
}

$envContent = @"
# Generated by deploy-to-aws.ps1 on $(Get-Date)

NODE_ENV=production

# Database
POSTGRES_DB=financedb
POSTGRES_USER=admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# JWT Secrets
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# AWS
AWS_REGION=$AWS_REGION
AWS_ACCESS_KEY_ID=$APP_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=$APP_SECRET_KEY
AWS_S3_BUCKET=$BUCKET_NAME
AWS_SQS_PROCESSING_URL=$QUEUE_URL

# OpenAI (Add your key)
OPENAI_API_KEY=

# CORS
ALLOWED_ORIGINS=$allowedOrigins

# Application
BCRYPT_ROUNDS=10
"@

$envContent | Out-File -FilePath ".env.production.generated" -Encoding UTF8

Write-Host "✅ Environment file generated: .env.production.generated" -ForegroundColor Green

#--------------------------------------------------
# Generate deployment summary
#--------------------------------------------------
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🎉 AWS Resources Created Successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 DEPLOYMENT SUMMARY" -ForegroundColor Yellow
Write-Host "----------------------------------------"
Write-Host "EC2 Instance ID: $INSTANCE_ID"
Write-Host "Public IP: $PUBLIC_IP"
Write-Host "SSH Key: $KEY_FILE"
Write-Host "Security Group: $SG_ID"
Write-Host ""
Write-Host "S3 Bucket: $BUCKET_NAME"
Write-Host "SQS Queue: $QUEUE_URL"
Write-Host "IAM User: finance-platform-app"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "📝 NEXT STEPS" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Connect to EC2:"
Write-Host "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP" -ForegroundColor White
Write-Host ""
Write-Host "2. On EC2, clone your repository:"
Write-Host "   sudo yum update -y" -ForegroundColor White
Write-Host "   sudo yum install -y git" -ForegroundColor White
Write-Host "   cd /opt" -ForegroundColor White
Write-Host "   sudo git clone YOUR_REPO_URL finance-platform" -ForegroundColor White
Write-Host "   cd finance-platform" -ForegroundColor White
Write-Host ""
Write-Host "3. Copy the generated .env file to EC2:"
Write-Host "   scp -i $KEY_FILE .env.production.generated ec2-user@${PUBLIC_IP}:/tmp/" -ForegroundColor White
Write-Host "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP" -ForegroundColor White
Write-Host "   sudo mv /tmp/.env.production.generated /opt/finance-platform/.env.production" -ForegroundColor White
Write-Host ""
Write-Host "4. Run the setup script on EC2:"
Write-Host "   cd /opt/finance-platform" -ForegroundColor White
Write-Host "   sudo bash scripts/ec2-setup.sh" -ForegroundColor White
Write-Host ""
Write-Host "5. Deploy the application:"
Write-Host "   sudo docker-compose -f docker-compose.production.yml up -d --build" -ForegroundColor White
Write-Host ""
Write-Host "6. Access your application:"
Write-Host "   http://$PUBLIC_IP" -ForegroundColor White
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANT: Save these credentials securely!" -ForegroundColor Red
Write-Host "    - $KEY_FILE (SSH key)"
Write-Host "    - .env.production.generated (environment variables)"
Write-Host "    - app-credentials.json (AWS access keys)"
Write-Host ""
Write-Host "Complete deployment guide: AWS_FREE_TIER_DEPLOYMENT.md" -ForegroundColor Yellow
Write-Host ""

# Save summary to file
$summaryContent = @"
Finance Platform Deployment Summary
Generated: $(Get-Date)

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
"@

$summaryContent | Out-File -FilePath "deployment-summary.txt" -Encoding UTF8

Write-Host "✅ Deployment summary saved to: deployment-summary.txt" -ForegroundColor Green
Write-Host ""
