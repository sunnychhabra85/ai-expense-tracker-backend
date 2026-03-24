# AWS Free Tier Deployment - Quick Reference

## 🚀 Quick Start Commands

### Option 1: Automated Deployment (Recommended)
```bash
# Linux/Mac
bash scripts/deploy-to-aws.sh

# Windows PowerShell
.\scripts\deploy-to-aws.ps1
```

### Option 2: Manual Deployment
Follow the complete guide in [AWS_FREE_TIER_DEPLOYMENT.md](AWS_FREE_TIER_DEPLOYMENT.md)

---

## 📋 Common Commands

### Local Testing
```bash
# Start all services locally
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### AWS EC2 Connection
```bash
# SSH into EC2 instance
ssh -i finance-platform-key.pem ec2-user@YOUR_PUBLIC_IP

# Copy files to EC2
scp -i finance-platform-key.pem file.txt ec2-user@YOUR_PUBLIC_IP:/tmp/
```

### Production Deployment on EC2
```bash
# Start services
sudo docker-compose -f docker-compose.production.yml up -d --build

# View logs
sudo docker-compose -f docker-compose.production.yml logs -f

# Restart services
sudo docker-compose -f docker-compose.production.yml restart

# Stop services
sudo docker-compose -f docker-compose.production.yml down

# Check status
sudo docker ps
```

### Database Operations
```bash
# Run migrations
npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma

# Access database
sudo docker exec -it finance_postgres psql -U admin -d financedb

# Backup database
sudo docker exec finance_postgres pg_dump -U admin financedb > backup.sql

# Restore database
sudo docker exec -i finance_postgres psql -U admin -d financedb < backup.sql
```

### Monitoring
```bash
# Check container status
sudo docker ps

# Check resource usage
sudo docker stats

# System resources
free -h
df -h
htop

# View logs of specific service
sudo docker logs finance_api_gateway
sudo docker logs -f finance_auth  # Follow logs
```

### Updates
```bash
# Pull latest code
cd /opt/finance-platform
sudo git pull origin main

# Rebuild and restart
sudo docker-compose -f docker-compose.production.yml up -d --build

# Run new migrations if any
npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma
```

---

## 🔍 Troubleshooting

### Check Service Health
```bash
# Nginx health
curl http://localhost/health

# API Gateway health
curl http://localhost/api/v1/health

# Individual service health
curl http://localhost:3001/api/v1/health  # Auth
curl http://localhost:3002/api/v1/health  # Upload
curl http://localhost:3003/api/v1/health  # Processing
curl http://localhost:3004/api/v1/health  # Analytics
curl http://localhost:3005/api/v1/health  # Notification
```

### Container Issues
```bash
# View container logs
sudo docker logs CONTAINER_NAME

# Restart specific container
sudo docker restart CONTAINER_NAME

# Remove and recreate container
sudo docker-compose -f docker-compose.production.yml up -d --force-recreate CONTAINER_NAME

# Check container resources
sudo docker stats
```

### Database Issues
```bash
# Check if PostgreSQL is running
sudo docker exec finance_postgres pg_isready -U admin

# Reset database (WARNING: destroys data)
sudo docker-compose -f docker-compose.production.yml down -v
sudo docker-compose -f docker-compose.production.yml up -d postgres
# Wait, then run migrations
```

### Memory Issues
```bash
# Check memory usage
free -h

# Add swap (if needed)
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

---

## 🧪 Testing the API

### Health Checks
```bash
export API_URL="http://YOUR_EC2_PUBLIC_IP"

# Nginx health
curl $API_URL/health

# API health
curl $API_URL/api/v1/health
```

### User Registration
```bash
curl -X POST $API_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### User Login
```bash
curl -X POST $API_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Save the token from response
export TOKEN="your_access_token_here"
```

### Upload Document
```bash
# Get presigned URL
curl -X POST $API_URL/api/v1/upload/presigned-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "receipt.pdf",
    "fileType": "application/pdf",
    "fileSize": 1024000
  }'

# Upload to S3 using the presigned URL (from response)
curl -X PUT "PRESIGNED_URL" \
  --upload-file receipt.pdf \
  -H "Content-Type: application/pdf"

# Confirm upload
curl -X POST $API_URL/api/v1/upload/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "document_id_from_presigned_response"
  }'
```

### Get Analytics
```bash
# Dashboard data
curl -X GET "$API_URL/api/v1/analytics/dashboard?timeRange=month" \
  -H "Authorization: Bearer $TOKEN"

# Transactions
curl -X GET "$API_URL/api/v1/analytics/transactions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🛠 AWS Resource Management

### Check AWS Costs
```bash
# Current month costs
aws ce get-cost-and-usage \
  --time-period Start=2024-03-01,End=2024-03-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# S3 usage
aws s3 ls s3://YOUR_BUCKET_NAME --recursive --summarize
```

### EC2 Management
```bash
# List instances
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=finance-platform" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]' \
  --output table

# Stop instance (to save costs)
aws ec2 stop-instances --instance-ids INSTANCE_ID

# Start instance
aws ec2 start-instances --instance-ids INSTANCE_ID

# Terminate instance (permanent)
aws ec2 terminate-instances --instance-ids INSTANCE_ID
```

### S3 Management
```bash
# List buckets
aws s3 ls

# List objects in bucket
aws s3 ls s3://YOUR_BUCKET_NAME --recursive

# Delete all objects (for cleanup)
aws s3 rm s3://YOUR_BUCKET_NAME --recursive

# Delete bucket
aws s3 rb s3://YOUR_BUCKET_NAME
```

### SQS Management
```bash
# Get queue attributes
aws sqs get-queue-attributes \
  --queue-url YOUR_QUEUE_URL \
  --attribute-names All

# Purge queue (delete all messages)
aws sqs purge-queue --queue-url YOUR_QUEUE_URL

# Delete queue
aws sqs delete-queue --queue-url YOUR_QUEUE_URL
```

---

## 📊 Monitoring Setup

### CloudWatch Logs (Optional)
```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure logging
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

### Prometheus Metrics
```bash
# Access metrics endpoint
curl http://localhost/metrics

# Or from outside
curl http://YOUR_EC2_PUBLIC_IP/metrics
```

---

## 🔐 Security Best Practices

### Update Secrets
```bash
# On EC2 instance
cd /opt/finance-platform
sudo nano .env.production

# After updating, restart services
sudo docker-compose -f docker-compose.production.yml restart
```

### SSL Certificate (Let's Encrypt)
```bash
# Install certbot
sudo yum install -y certbot python3-certbot-nginx

# Stop nginx container
sudo docker stop finance_nginx

# Get certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --agree-tos \
  --email your@email.com

# Copy certificates
sudo mkdir -p /opt/finance-platform/nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
     /opt/finance-platform/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem \
     /opt/finance-platform/nginx/ssl/

# Update nginx.conf to enable HTTPS
sudo nano /opt/finance-platform/nginx/nginx.conf

# Restart nginx
sudo docker start finance_nginx

# Auto-renewal
echo "0 0 * * * root certbot renew --quiet" | sudo tee -a /etc/crontab
```

### Firewall Rules
```bash
# Update security group to restrict SSH
aws ec2 revoke-security-group-ingress \
  --group-id SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

# Allow only your IP
aws ec2 authorize-security-group-ingress \
  --group-id SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32
```

---

## 🗑 Complete Cleanup

### Delete All AWS Resources
```bash
# Stop and terminate EC2
aws ec2 terminate-instances --instance-ids INSTANCE_ID

# Wait for termination
aws ec2 wait instance-terminated --instance-ids INSTANCE_ID

# Delete security group
aws ec2 delete-security-group --group-id SG_ID

# Delete S3 bucket
aws s3 rm s3://BUCKET_NAME --recursive
aws s3 rb s3://BUCKET_NAME

# Delete SQS queue
aws sqs delete-queue --queue-url QUEUE_URL

# Delete IAM user
aws iam delete-user-policy \
  --user-name finance-platform-app \
  --policy-name FinancePlatformPolicy

# Delete access keys first
aws iam list-access-keys --user-name finance-platform-app
aws iam delete-access-key \
  --user-name finance-platform-app \
  --access-key-id ACCESS_KEY_ID

aws iam delete-user --user-name finance-platform-app

# Delete key pair
aws ec2 delete-key-pair --key-name finance-platform-key
rm finance-platform-key.pem

# (Optional) Delete Route53 hosted zone
aws route53 delete-hosted-zone --id ZONE_ID
```

---

## 📞 Support & Resources

- **Full Guide**: [AWS_FREE_TIER_DEPLOYMENT.md](AWS_FREE_TIER_DEPLOYMENT.md)
- **Docker Compose Config**: [docker-compose.production.yml](docker-compose.production.yml)
- **Nginx Config**: [nginx/nginx.conf](nginx/nginx.conf)
- **Environment Template**: [.env.production.example](.env.production.example)
- **AWS Free Tier**: https://aws.amazon.com/free/
- **Docker Documentation**: https://docs.docker.com/
- **Nginx Documentation**: https://nginx.org/en/docs/

---

## 💰 Cost Monitoring

### Free Tier Limits Reminder
- **EC2 t2.micro**: 750 hours/month (24/7 for 1 instance)
- **EBS**: 30 GB
- **Data Transfer**: 15 GB/month out
- **S3**: 5 GB, 20K GET, 2K PUT requests
- **SQS**: 1 million requests/month

### After Free Tier (Estimated)
- **EC2 t2.micro**: ~$8-10/month
- **EBS 20GB**: ~$2/month
- **S3 1GB**: ~$0.023/month
- **SQS**: First 1M requests free
- **Data Transfer**: First 1GB free, then $0.09/GB

**Total**: ~$10-12/month after first year

---

**Quick Help**: For immediate issues, check the [Troubleshooting](#troubleshooting) section above! 🚀
