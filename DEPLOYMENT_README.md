# AWS Free Tier Deployment Files

This directory contains all the necessary files for deploying the Finance Platform to AWS under the free tier using a single EC2 instance.

## 📁 Files Overview

### Configuration Files
- **docker-compose.production.yml** - Production-optimized Docker Compose configuration
  - Memory-optimized for t2.micro (1GB RAM)
  - All 6 microservices + PostgreSQL + Redis + Nginx
  - Health checks and auto-restart enabled

- **nginx/nginx.conf** - Nginx reverse proxy configuration
  - Routes traffic to microservices
  - SSL/HTTPS support (ready for Let's Encrypt)
  - Rate limiting and security headers
  - Health check endpoints

- **.env.production.example** - Environment variables template
  - Copy to `.env.production` and fill in your values
  - Includes all required secrets and AWS credentials

### Deployment Scripts
- **scripts/ec2-setup.sh** - Automated EC2 instance setup
  - Installs Docker, Docker Compose, Node.js, AWS CLI
  - Configures system settings for production
  - Creates systemd service for auto-start

- **scripts/deploy-to-aws.sh** - Full AWS resource creation (Linux/Mac)
  - Creates S3 bucket, SQS queue, IAM user
  - Launches EC2 instance with security group
  - Generates environment file with secrets
  - Provides step-by-step instructions

- **scripts/deploy-to-aws.ps1** - Full AWS resource creation (Windows)
  - Same functionality as bash script
  - Native PowerShell for Windows users

### Documentation
- **AWS_FREE_TIER_DEPLOYMENT.md** - Complete step-by-step deployment guide
  - Architecture overview
  - Free tier limits and cost estimates
  - Manual deployment instructions
  - SSL setup, monitoring, troubleshooting
  - Cleanup instructions

- **AWS_QUICK_REFERENCE.md** - Quick command reference
  - Common operations and commands
  - Testing and API examples
  - AWS resource management
  - Troubleshooting shortcuts

## 🚀 Quick Start

### Option 1: Automated (Recommended)
```bash
# Linux/Mac
bash scripts/deploy-to-aws.sh

# Windows
.\scripts\deploy-to-aws.ps1
```

### Option 2: Manual
Follow the complete guide in [AWS_FREE_TIER_DEPLOYMENT.md](../AWS_FREE_TIER_DEPLOYMENT.md)

## 📊 Architecture

```
Users → Route53 → EC2 (t2.micro)
                    │
                    ├── Nginx (:80, :443)
                    │   │
                    │   └── API Gateway (:3000)
                    │       ├── Auth Service (:3001)
                    │       ├── Upload Service (:3002)
                    │       ├── Processing Service (:3003)
                    │       ├── Analytics Service (:3004)
                    │       └── Notification Service (:3005)
                    │
                    ├── PostgreSQL (:5432)
                    └── Redis (:6379)

AWS Services:
├── S3 (Document storage)
├── SQS (Message queue)
└── Textract (OCR processing)
```

## 💰 Cost Estimate

### Free Tier (First 12 months)
- **$0/month** for basic operation
- Textract charges apply (~$0.0015/page)
- Route53 if used ($0.50/month)

### After Free Tier
- **~$10-12/month** for EC2 + EBS + Data Transfer

Complete cost breakdown in [AWS_FREE_TIER_DEPLOYMENT.md](../AWS_FREE_TIER_DEPLOYMENT.md#free-tier-limits)

## 🔧 System Requirements

### AWS Free Tier Eligibility
- Active AWS account (first 12 months)
- Credit/debit card for verification
- No previous free tier usage exhaustion

### EC2 Instance
- Type: **t2.micro** (1 vCPU, 1GB RAM)
- Storage: **20 GB EBS** (General Purpose SSD)
- OS: **Amazon Linux 2023** or Ubuntu 22.04

### Services Fitted
All services optimized to run on 1GB RAM:
- Nginx: 32 MB
- PostgreSQL: 256 MB
- Redis: 64 MB
- Each microservice: 128 MB
- **Total**: ~900 MB + system overhead

## 🔐 Security Features

### Network Security
- Security groups with minimal exposed ports (22, 80, 443)
- Nginx reverse proxy (no direct service exposure)
- Rate limiting on API endpoints
- CORS configuration

### Application Security
- JWT authentication
- Bcrypt password hashing
- Environment-based secrets
- HTTPS/SSL support (with Let's Encrypt)

### Security Headers
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy

## 📈 Monitoring

### Built-in
- Docker health checks for all services
- Prometheus metrics endpoint (`/metrics`)
- Health endpoints for each service
- Nginx access and error logs

### Optional
- AWS CloudWatch for logs and metrics
- Uptime monitoring (UptimeRobot, Pingdom)
- Cost alerts in AWS Billing

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy to AWS EC2

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to EC2
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /opt/finance-platform
            sudo git pull origin main
            sudo docker-compose -f docker-compose.production.yml up -d --build
```

## 🧪 Testing

### Local Testing
```bash
# Test production setup locally
docker-compose -f docker-compose.production.yml up -d --build
```

### Remote Testing
```bash
# Health check
curl http://YOUR_EC2_IP/health

# API test
curl http://YOUR_EC2_IP/api/v1/health
```

## 📚 Additional Resources

- [Main README](../README.md) - Project overview
- [Deployment Guide](../DEPLOYMENT_GUIDE.md) - EKS/ECS deployment options
- [Cost Optimization](../infrastructure/COST_OPTIMIZATION.md) - Cost strategies
- [Troubleshooting](../infrastructure/TROUBLESHOOTING_GUIDE.md) - Common issues

## 🆘 Support

If you encounter issues:
1. Check [AWS_QUICK_REFERENCE.md](../AWS_QUICK_REFERENCE.md) for common commands
2. Review logs: `sudo docker-compose -f docker-compose.production.yml logs`
3. See the [Troubleshooting section](../AWS_FREE_TIER_DEPLOYMENT.md#troubleshooting)
4. Verify free tier limits haven't been exceeded

## 🎯 Next Steps After Deployment

1. ✅ Verify all services are healthy
2. ✅ Test API endpoints
3. ✅ Setup SSL with Let's Encrypt
4. ✅ Configure domain (if applicable)
5. ✅ Setup automated backups
6. ✅ Enable monitoring/alerts
7. ✅ Configure CI/CD pipeline
8. ✅ Document custom configurations

---

**Ready to deploy?** Start with [AWS_FREE_TIER_DEPLOYMENT.md](../AWS_FREE_TIER_DEPLOYMENT.md)! 🚀
