# AWS Free Tier Deployment Guide
## Finance Platform - Single EC2 Instance

This guide will help you deploy the entire Finance Platform microservices application on a **single AWS EC2 t2.micro instance** (free tier eligible) using Docker Compose and Nginx as reverse proxy.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Free Tier Limits](#free-tier-limits)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [Post-Deployment](#post-deployment)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Cleanup](#cleanup)

---

## 🏗 Architecture Overview

```
Users
   │
   ▼
Route53 (optional domain)
   │
   ▼
EC2 t2.micro (1 vCPU, 1GB RAM)
   │
   ├── Nginx Reverse Proxy (Port 80/443)
   │   │
   │   ▼
   ├── API Gateway :3000
   │   │
   │   ├── Auth Service :3001
   │   ├── Upload Service :3002
   │   ├── Processing Service :3003
   │   ├── Analytics Service :3004
   │   └── Notification Service :3005
   │
   ├── PostgreSQL :5432
   └── Redis :6379

External AWS Services (Free Tier):
   ├── S3 (5GB storage)
   ├── SQS (1M requests/month)
   └── Textract (Pay per use)
```

---

## ✅ Prerequisites

### 1. AWS Account
- Active AWS account
- Free tier eligible (first 12 months)
- Credit/debit card for verification

### 2. Local Machine Requirements
- AWS CLI installed and configured
- SSH client (Terminal/PowerShell)
- Git installed
- Text editor

### 3. Domain (Optional)
- Your own domain for Route53
- Or use EC2 public IP directly

### 4. Required API Keys
- OpenAI API key (for AI features) - Optional but recommended
- AWS credentials with appropriate permissions

---

## 💰 Free Tier Limits

### What's Included in Free Tier:
| Service | Free Tier Allowance | Our Usage |
|---------|-------------------|-----------|
| **EC2** | 750 hours/month of t2.micro | ✅ 1 instance 24/7 |
| **EBS** | 30 GB General Purpose SSD | ✅ ~20 GB needed |
| **Data Transfer** | 15 GB out/month | ✅ Sufficient for testing |
| **S3** | 5 GB storage, 20K GET, 2K PUT | ✅ Document storage |
| **SQS** | 1 million requests/month | ✅ Message queue |

### What Costs Money:
❌ **Elastic IP** (if not attached to running instance): $0.005/hour  
❌ **Route53** (if used): $0.50/month per hosted zone  
❌ **Textract**: ~$0.0015 per page processed  
❌ **Data Transfer**: Over 15 GB/month  

### Monthly Cost Estimate:
- **Pure Free Tier**: $0/month (first 12 months)
- **With Textract** (100 pages): ~$0.15/month
- **With Route53**: +$0.50/month
- **After Free Tier**: ~$8-10/month for EC2

---

## 🚀 Step-by-Step Deployment

### Step 1: Configure AWS CLI

1. Install AWS CLI (if not already installed):
```bash
# Windows
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Mac
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

2. Configure AWS credentials:
```bash
aws configure
```

Enter:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1` (best for free tier)
- Default output format: `json`

3. Verify configuration:
```bash
aws sts get-caller-identity
```

---

### Step 2: Create AWS Resources

#### 2.1 Create S3 Bucket
```bash
# Replace with your unique bucket name
export BUCKET_NAME="finance-platform-uploads-$(date +%s)"

aws s3 mb s3://$BUCKET_NAME --region us-east-1

# Enable versioning (optional)
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# Set lifecycle policy to reduce costs
aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET_NAME \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "DeleteOldFiles",
      "Status": "Enabled",
      "Expiration": {"Days": 90}
    }]
  }'

echo "S3 Bucket created: $BUCKET_NAME"
```

#### 2.2 Create SQS Queue
```bash
# Create queue
aws sqs create-queue \
  --queue-name document-processing \
  --region us-east-1

# Get queue URL
export QUEUE_URL=$(aws sqs get-queue-url \
  --queue-name document-processing \
  --region us-east-1 \
  --query 'QueueUrl' \
  --output text)

echo "SQS Queue URL: $QUEUE_URL"
```

#### 2.3 Create IAM User for Application
```bash
# Create IAM user
aws iam create-user --user-name finance-platform-app

# Create IAM policy
cat > app-policy.json <<'EOF'
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
        "arn:aws:s3:::BUCKET_NAME/*",
        "arn:aws:s3:::BUCKET_NAME"
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
      "Resource": "arn:aws:sqs:us-east-1:*:document-processing"
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

# Replace BUCKET_NAME in policy
sed -i "s/BUCKET_NAME/$BUCKET_NAME/g" app-policy.json

# Create and attach policy
aws iam put-user-policy \
  --user-name finance-platform-app \
  --policy-name FinancePlatformPolicy \
  --policy-document file://app-policy.json

# Create access keys
aws iam create-access-key --user-name finance-platform-app > app-credentials.json

export AWS_APP_ACCESS_KEY=$(cat app-credentials.json | grep -oP '"AccessKeyId": "\K[^"]+')
export AWS_APP_SECRET_KEY=$(cat app-credentials.json | grep -oP '"SecretAccessKey": "\K[^"]+')

echo "IAM User created with access keys (saved in app-credentials.json)"
echo "⚠️  Keep app-credentials.json secure and delete after setup!"
```

---

### Step 3: Launch EC2 Instance

#### 3.1 Create Security Group
```bash
# Create security group
aws ec2 create-security-group \
  --group-name finance-platform-sg \
  --description "Security group for Finance Platform" \
  --region us-east-1

# Get security group ID
export SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=finance-platform-sg \
  --query 'SecurityGroups[0].GroupId' \
  --output text \
  --region us-east-1)

# Allow SSH (22)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Allow HTTP (80)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Allow HTTPS (443) - for future SSL
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

echo "Security group created: $SG_ID"
```

#### 3.2 Create or Import Key Pair
```bash
# Option 1: Create new key pair
aws ec2 create-key-pair \
  --key-name finance-platform-key \
  --query 'KeyMaterial' \
  --output text \
  --region us-east-1 > finance-platform-key.pem

chmod 400 finance-platform-key.pem

# Option 2: Import existing public key
# aws ec2 import-key-pair \
#   --key-name finance-platform-key \
#   --public-key-material fileb://~/.ssh/id_rsa.pub \
#   --region us-east-1
```

#### 3.3 Launch EC2 Instance
```bash
# Get latest Amazon Linux 2023 AMI
export AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' \
            'Name=state,Values=available' \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text \
  --region us-east-1)

# Launch instance
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t2.micro \
  --key-name finance-platform-key \
  --security-group-ids $SG_ID \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=finance-platform}]' \
  --region us-east-1

# Get instance ID and public IP
export INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=finance-platform" \
            "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text \
  --region us-east-1)

# Wait for instance to be running
echo "Waiting for instance to start..."
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region us-east-1

# Get public IP
export PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text \
  --region us-east-1)

echo "EC2 Instance created!"
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo ""
echo "Save these values for later use!"
```

---

### Step 4: Setup EC2 Instance

#### 4.1 Connect to EC2
```bash
# SSH into instance
ssh -i finance-platform-key.pem ec2-user@$PUBLIC_IP
```

#### 4.2 Run Setup Script
```bash
# On EC2 instance
# Download and run setup script
sudo yum update -y
sudo yum install -y git

# Clone your repository
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git finance-platform
cd finance-platform

# Run setup script
sudo bash scripts/ec2-setup.sh
```

---

### Step 5: Configure Application

#### 5.1 Create Environment File
```bash
# On EC2 instance
cd /opt/finance-platform

# Copy template
sudo cp .env.production.example .env.production

# Edit with your values
sudo nano .env.production
```

Fill in the following values:
```bash
# Database
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD  # Generate: openssl rand -base64 32

# JWT Secrets
JWT_ACCESS_SECRET=YOUR_32_CHAR_SECRET   # Generate: openssl rand -base64 32
JWT_REFRESH_SECRET=YOUR_DIFFERENT_32    # Generate: openssl rand -base64 32

# Redis
REDIS_PASSWORD=YOUR_REDIS_PASSWORD      # Generate: openssl rand -base64 24

# AWS (from Step 2.3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY       # From app-credentials.json
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY   # From app-credentials.json
AWS_S3_BUCKET=YOUR_BUCKET_NAME          # From Step 2.1
AWS_SQS_PROCESSING_URL=YOUR_QUEUE_URL   # From Step 2.2

# OpenAI
OPENAI_API_KEY=sk-YOUR_OPENAI_KEY       # Optional

# CORS
ALLOWED_ORIGINS=http://YOUR_PUBLIC_IP,https://yourdomain.com
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

#### 5.2 Verify Nginx Configuration
```bash
# Check nginx config
sudo cat nginx/nginx.conf

# If you need to update server_name with your domain
sudo nano nginx/nginx.conf
# Change: server_name _;
# To: server_name yourdomain.com www.yourdomain.com;
```

---

### Step 6: Build and Deploy

#### 6.1 Install Dependencies
```bash
# On EC2 instance
cd /opt/finance-platform

# Install npm dependencies
npm install

# Generate Prisma client
npx prisma generate --schema=libs/database/prisma/schema.prisma
```

#### 6.2 Run Database Migrations
```bash
# Start only PostgreSQL first
sudo docker-compose -f docker-compose.production.yml up -d postgres

# Wait for PostgreSQL to be ready
sleep 30

# Run migrations
npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

#### 6.3 Build and Start All Services
```bash
# Build and start all services
sudo docker-compose -f docker-compose.production.yml up -d --build

# This will take 10-15 minutes on t2.micro
# Monitor progress
sudo docker-compose -f docker-compose.production.yml logs -f
```

#### 6.4 Verify Deployment
```bash
# Check all containers are running
sudo docker ps

# You should see:
# - finance_nginx
# - finance_api_gateway
# - finance_auth
# - finance_upload
# - finance_processing
# - finance_analytics
# - finance_notification
# - finance_postgres
# - finance_redis

# Check health
curl http://localhost/health
curl http://localhost/api/v1/health
```

---

### Step 7: Test the Application

#### 7.1 Test from Local Machine
```bash
# Replace with your EC2 public IP
export API_URL="http://YOUR_EC2_PUBLIC_IP"

# Test health endpoint
curl $API_URL/health

# Test API Gateway health
curl $API_URL/api/v1/health

# Register a new user
curl -X POST $API_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Login
curl -X POST $API_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

#### 7.2 Test in Browser
Open: `http://YOUR_EC2_PUBLIC_IP/health`

You should see: `healthy`

---

### Step 8: (Optional) Setup Domain with Route53

#### 8.1 Create Hosted Zone
```bash
# If you have a domain
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)
```

#### 8.2 Create A Record
```bash
# Get hosted zone ID
export ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='yourdomain.com.'].Id" \
  --output text | cut -d'/' -f3)

# Create A record
cat > change-batch.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "yourdomain.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$PUBLIC_IP"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://change-batch.json
```

#### 8.3 Update Nameservers
Get nameservers from AWS and update with your domain registrar:
```bash
aws route53 get-hosted-zone --id $ZONE_ID
```

---

### Step 9: (Optional) Setup SSL with Let's Encrypt

```bash
# On EC2 instance
# Install certbot
sudo yum install -y certbot python3-certbot-nginx

# Stop nginx temporarily
sudo docker stop finance_nginx

# Get certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --agree-tos \
  --email your@email.com \
  --non-interactive

# Copy certificates to nginx directory
sudo mkdir -p /opt/finance-platform/nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
     /opt/finance-platform/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem \
     /opt/finance-platform/nginx/ssl/

# Update nginx config to enable HTTPS
sudo nano /opt/finance-platform/nginx/nginx.conf
# Uncomment HTTPS server block

# Restart nginx
sudo docker start finance_nginx

# Setup auto-renewal
echo "0 0 * * * root certbot renew --quiet" | sudo tee -a /etc/crontab
```

---

## 📊 Post-Deployment

### Enable Auto-Start on Reboot
```bash
# On EC2 instance
sudo systemctl enable finance-platform.service
sudo systemctl start finance-platform.service

# Verify
sudo systemctl status finance-platform.service
```

### Create Backup Script
```bash
# Create backup directory
sudo mkdir -p /opt/backups

# Create backup script
cat > /opt/finance-platform/backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup database
docker exec finance_postgres pg_dump -U admin financedb > "$BACKUP_DIR/db_$DATE.sql"

# Compress
gzip "$BACKUP_DIR/db_$DATE.sql"

# Keep only last 7 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/finance-platform/backup.sh

# Add to cron (daily at 2 AM)
echo "0 2 * * * /opt/finance-platform/backup.sh" | sudo crontab -
```

---

## 🔍 Monitoring & Maintenance

### Check Service Status
```bash
# All containers
sudo docker ps

# Specific service logs
sudo docker logs finance_api_gateway
sudo docker logs -f finance_auth  # Follow logs

# Resource usage
sudo docker stats

# System resources
htop
free -h
df -h
```

### Restart Services
```bash
# Restart all
sudo docker-compose -f docker-compose.production.yml restart

# Restart specific service
sudo docker restart finance_api_gateway

# Full restart with image rebuild
sudo docker-compose -f docker-compose.production.yml down
sudo docker-compose -f docker-compose.production.yml up -d --build
```

### Update Application
```bash
# Pull latest code
cd /opt/finance-platform
sudo git pull origin main

# Rebuild and restart
sudo docker-compose -f docker-compose.production.yml up -d --build

# Run migrations if needed
npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

### Monitor Costs
```bash
# Check AWS costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# S3 usage
aws s3 ls s3://$BUCKET_NAME --recursive --summarize

# Set up billing alerts in AWS Console
```

---

## 🔧 Troubleshooting

### Container Won't Start
```bash
# Check logs
sudo docker logs CONTAINER_NAME

# Check resource usage
sudo docker stats
free -h

# If out of memory, increase swap
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Can't Connect from Browser
```bash
# Check nginx is running
sudo docker ps | grep nginx

# Check security group allows port 80
aws ec2 describe-security-groups --group-ids $SG_ID

# Test from EC2 instance itself
curl http://localhost/health

# Check EC2 instance is running
aws ec2 describe-instances --instance-ids $INSTANCE_ID
```

### Database Connection Issues
```bash
# Check postgres is running
sudo docker exec finance_postgres pg_isready -U admin

# Check connection from app
sudo docker exec finance_auth \
  wget -qO- http://localhost:3001/api/v1/health

# Reset database
sudo docker-compose -f docker-compose.production.yml down -v
sudo docker-compose -f docker-compose.production.yml up -d postgres
# Wait and run migrations again
```

### High Memory Usage
```bash
# Check memory
free -h

# Restart services one by one
sudo docker restart finance_auth
sudo docker restart finance_upload
# etc.

# Reduce memory limits in docker-compose.production.yml
```

---

## 🧹 Cleanup (Delete Everything)

### Delete AWS Resources
```bash
# Stop and terminate EC2 instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region us-east-1

# Delete security group (wait for instance to terminate first)
aws ec2 delete-security-group --group-id $SG_ID --region us-east-1

# Delete S3 bucket (empty first)
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3 rb s3://$BUCKET_NAME

# Delete SQS queue
aws sqs delete-queue --queue-url $QUEUE_URL --region us-east-1

# Delete IAM user (detach policy first)
aws iam delete-user-policy \
  --user-name finance-platform-app \
  --policy-name FinancePlatformPolicy
aws iam delete-user --user-name finance-platform-app

# Delete key pair
aws ec2 delete-key-pair --key-name finance-platform-key --region us-east-1
rm finance-platform-key.pem

# (Optional) Delete Route53 hosted zone
aws route53 delete-hosted-zone --id $ZONE_ID
```

---

## 📚 Additional Resources

- [AWS Free Tier](https://aws.amazon.com/free/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Certbot](https://certbot.eff.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 🆘 Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Docker logs: `sudo docker-compose -f docker-compose.production.yml logs`
3. Check AWS service limits and quotas
4. Verify all environment variables are set correctly
5. Ensure security groups allow required ports

---

## ✅ Deployment Checklist

- [ ] AWS CLI configured
- [ ] S3 bucket created
- [ ] SQS queue created
- [ ] IAM user and credentials created
- [ ] EC2 instance launched
- [ ] Security group configured
- [ ] SSH key pair created
- [ ] EC2 setup script executed
- [ ] Environment file configured
- [ ] Database migrations run
- [ ] All services built and running
- [ ] Health endpoints responding
- [ ] Test user registered and logged in
- [ ] (Optional) Domain configured
- [ ] (Optional) SSL certificate installed
- [ ] Auto-start enabled
- [ ] Backup script configured
- [ ] Monitoring setup

---

**Congratulations! Your Finance Platform is now deployed on AWS! 🎉**

Access your application at: `http://YOUR_EC2_PUBLIC_IP`
