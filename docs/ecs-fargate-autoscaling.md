# ECS Fargate Auto-Scaling Implementation
## Complete Setup Guide with Terraform

This guide shows how to deploy your microservices with auto-scaling using AWS ECS Fargate.

---

## 🏗️ Architecture

```
Internet
   ↓
Route 53 (Optional)
   ↓
Application Load Balancer (ALB)
├── Target Group: API Gateway
├── Target Group: Auth Service
├── Target Group: Upload Service
├── Target Group: Analytics Service
└── Target Group: Notification Service
   ↓
ECS Fargate Services (Auto-scaling 2-10 tasks each)
├── auth-service (scales on CPU/Memory)
├── upload-service (scales on CPU/Memory)
├── processing-service (scales on SQS queue depth)
├── analytics-service (scales on CPU/Memory)
└── notification-service (scales on CPU/Memory)
   ↓
RDS PostgreSQL (db.t3.micro) + ElastiCache Redis
   ↓
S3 + SQS + Textract
```

---

## 📋 Prerequisites

1. AWS CLI configured
2. Terraform installed (v1.0+)
3. Docker images in ECR (Elastic Container Registry)
4. Domain name (optional)

---

## 💰 Cost Estimate

| Resource | Specs | Monthly Cost |
|----------|-------|--------------|
| **ALB** | 1 load balancer | ~$16 |
| **ECS Fargate** | 5 services × 0.25 vCPU × 0.5 GB × 2 tasks | ~$30 |
| **RDS PostgreSQL** | db.t3.micro | $15 (Free tier eligible) |
| **ElastiCache Redis** | cache.t3.micro | ~$12 |
| **ECR Storage** | 5 GB images | ~$0.50 |
| **CloudWatch Logs** | 5 GB/month | ~$2.50 |
| **Data Transfer** | 15 GB out | Free tier |
| **S3 + SQS** | Minimal usage | ~$1 |
| **Total** | | **~$77/month** |

With RDS free tier: **~$62/month**

---

## 📁 Project Structure

```
infrastructure/
└── terraform/
    └── ecs-fargate/
        ├── main.tf              # Main configuration
        ├── variables.tf         # Input variables
        ├── outputs.tf           # Output values
        ├── vpc.tf              # VPC and networking
        ├── alb.tf              # Application Load Balancer
        ├── ecs.tf              # ECS cluster and services
        ├── rds.tf              # PostgreSQL database
        ├── elasticache.tf      # Redis cache
        ├── ecr.tf              # Container registry
        ├── autoscaling.tf      # Auto-scaling policies
        ├── cloudwatch.tf       # Monitoring and alarms
        ├── iam.tf              # IAM roles and policies
        └── terraform.tfvars    # Your configuration values
```

---

## 🚀 Step-by-Step Implementation

### Step 1: Push Docker Images to ECR

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Create ECR repositories
for service in auth-service upload-service processing-service \
               analytics-service notification-service api-gateway; do
    aws ecr create-repository \
      --repository-name finance/${service} \
      --region us-east-1
done

# Build and push images
# Build all services
npm run build

# Tag and push each service
for service in auth-service upload-service processing-service \
               analytics-service notification-service api-gateway; do
    docker build -t finance/${service}:latest \
      -f apps/${service}/Dockerfile .
    
    docker tag finance/${service}:latest \
      ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/finance/${service}:latest
    
    docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/finance/${service}:latest
done
```

### Step 2: Create Terraform Configuration

Create `infrastructure/terraform/ecs-fargate/main.tf`:

```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "finance-platform-terraform-state"
    key    = "ecs-fargate/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "finance-platform"
      ManagedBy   = "terraform"
    }
  }
}

# Get AWS account ID
data "aws_caller_identity" "current" {}

# Get availability zones
data "aws_availability_zones" "available" {
  state = "available"
}
```

### Step 3: Create Auto-Scaling Configuration

Create `infrastructure/terraform/ecs-fargate/autoscaling.tf`:

```hcl
# Auto-scaling for Auth Service
resource "aws_appautoscaling_target" "auth_service" {
  max_capacity       = var.auth_service_max_tasks
  min_capacity       = var.auth_service_min_tasks
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.auth.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based auto-scaling
resource "aws_appautoscaling_policy" "auth_cpu" {
  name               = "auth-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.auth_service.resource_id
  scalable_dimension = aws_appautoscaling_target.auth_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.auth_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory-based auto-scaling
resource "aws_appautoscaling_policy" "auth_memory" {
  name               = "auth-service-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.auth_service.resource_id
  scalable_dimension = aws_appautoscaling_target.auth_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.auth_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Request count based scaling (ALB)
resource "aws_appautoscaling_policy" "auth_request_count" {
  name               = "auth-service-request-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.auth_service.resource_id
  scalable_dimension = aws_appautoscaling_target.auth_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.auth_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.auth.arn_suffix}"
    }
    target_value = 1000.0  # 1000 requests per target per minute
  }
}

# Repeat for other services (upload, analytics, notification)
# Processing service uses SQS-based scaling (see below)

# SQS-based auto-scaling for Processing Service
resource "aws_appautoscaling_target" "processing_service" {
  max_capacity       = var.processing_service_max_tasks
  min_capacity       = var.processing_service_min_tasks
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.processing.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "processing_sqs" {
  name               = "processing-service-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.processing_service.resource_id
  scalable_dimension = aws_appautoscaling_target.processing_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processing_service.service_namespace

  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"
      
      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.document_processing.name
      }
    }
    
    target_value = 10.0  # Scale when queue has 10+ messages per task
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scheduled scaling (optional) - scale up during business hours
resource "aws_appautoscaling_scheduled_action" "scale_up_morning" {
  name               = "scale-up-morning"
  service_namespace  = aws_appautoscaling_target.auth_service.service_namespace
  resource_id        = aws_appautoscaling_target.auth_service.resource_id
  scalable_dimension = aws_appautoscaling_target.auth_service.scalable_dimension
  schedule           = "cron(0 8 * * ? *)"  # 8 AM UTC
  
  scalable_target_action {
    min_capacity = 4
    max_capacity = 10
  }
}

resource "aws_appautoscaling_scheduled_action" "scale_down_evening" {
  name               = "scale-down-evening"
  service_namespace  = aws_appautoscaling_target.auth_service.service_namespace
  resource_id        = aws_appautoscaling_target.auth_service.resource_id
  scalable_dimension = aws_appautoscaling_target.auth_service.scalable_dimension
  schedule           = "cron(0 22 * * ? *)"  # 10 PM UTC
  
  scalable_target_action {
    min_capacity = 2
    max_capacity = 5
  }
}
```

### Step 4: Create Variables File

Create `infrastructure/terraform/ecs-fargate/terraform.tfvars`:

```hcl
# Project Configuration
aws_region  = "us-east-1"
environment = "production"
project_name = "finance-platform"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]

# ECS Configuration
ecs_cluster_name = "finance-platform-cluster"

# Auto-scaling Configuration
auth_service_min_tasks = 2
auth_service_max_tasks = 10
auth_service_cpu       = 256   # 0.25 vCPU
auth_service_memory    = 512   # 0.5 GB

upload_service_min_tasks = 2
upload_service_max_tasks = 10
upload_service_cpu       = 256
upload_service_memory    = 512

processing_service_min_tasks = 1
processing_service_max_tasks = 5
processing_service_cpu       = 512   # 0.5 vCPU (needs more for OCR)
processing_service_memory    = 1024  # 1 GB

analytics_service_min_tasks = 2
analytics_service_max_tasks = 8
analytics_service_cpu       = 256
analytics_service_memory    = 512

notification_service_min_tasks = 2
notification_service_max_tasks = 6
notification_service_cpu       = 256
notification_service_memory    = 512

# RDS Configuration
db_instance_class    = "db.t3.micro"  # Free tier eligible
db_allocated_storage = 20
db_engine_version    = "16"
db_name              = "financedb"
db_username          = "admin"
# db_password - set via environment variable

# ElastiCache Configuration
redis_node_type   = "cache.t3.micro"
redis_num_nodes   = 1

# ALB Configuration
alb_name = "finance-platform-alb"
health_check_path = "/api/v1/health"

# Domain (optional)
domain_name = ""  # e.g., "api.yourdomain.com"
certificate_arn = ""  # Leave empty to use HTTP only

# Monitoring
enable_container_insights = true
log_retention_days        = 7

# Tags
tags = {
  Environment = "production"
  Project     = "finance-platform"
  ManagedBy   = "terraform"
}
```

### Step 5: Deploy with Terraform

```bash
# Navigate to terraform directory
cd infrastructure/terraform/ecs-fargate

# Initialize Terraform
terraform init

# Create S3 bucket for state (first time only)
aws s3 mb s3://finance-platform-terraform-state

# Set database password (don't commit this!)
export TF_VAR_db_password="YOUR_SECURE_PASSWORD"

# Review plan
terraform plan -out=tfplan

# Apply configuration
terraform apply tfplan

# This will take 10-15 minutes to create all resources
```

### Step 6: Verify Deployment

```bash
# Get ALB DNS name
terraform output alb_dns_name

# Test health endpoint
curl http://$(terraform output -raw alb_dns_name)/api/v1/health

# Check ECS services
aws ecs list-services --cluster finance-platform-cluster

# Check auto-scaling
aws application-autoscaling describe-scalable-targets \
  --service-namespace ecs

# View CloudWatch metrics
aws cloudwatch list-metrics --namespace ECS/ContainerInsights
```

---

## 📊 Monitoring Auto-Scaling

### CloudWatch Dashboard

Create a dashboard to monitor auto-scaling:

```bash
# In AWS Console > CloudWatch > Dashboards
# Or use Terraform to create dashboard

# Key metrics to monitor:
- ECS Service CPU Utilization
- ECS Service Memory Utilization
- ALB Request Count
- SQS Queue Depth
- ECS Running Task Count
- ALB Target Health
```

### CloudWatch Alarms

```hcl
# Add to cloudwatch.tf

# Alert when all tasks are unhealthy
resource "aws_cloudwatch_metric_alarm" "auth_service_unhealthy" {
  alarm_name          = "auth-service-all-unhealthy"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "1"
  alarm_description   = "Alert when no healthy auth service tasks"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    TargetGroup  = aws_lb_target_group.auth.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }
}

# Alert when scaling to max capacity
resource "aws_cloudwatch_metric_alarm" "auth_service_max_capacity" {
  alarm_name          = "auth-service-max-capacity"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "DesiredTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = var.auth_service_max_tasks
  alarm_description   = "Auth service at max capacity"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.auth.name
  }
}
```

---

## 🔄 Updates and Deployments

### Blue/Green Deployment

```bash
# Build new version
docker build -t finance/auth-service:v2 .

# Push to ECR
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/finance/auth-service:v2

# Update task definition
aws ecs register-task-definition \
  --family auth-service \
  --container-definitions file://task-def.json

# Update service (ECS will perform rolling update)
aws ecs update-service \
  --cluster finance-platform-cluster \
  --service auth-service \
  --task-definition auth-service:LATEST \
  --force-new-deployment
```

### Rollback

```bash
# List previous task definitions
aws ecs list-task-definitions --family-prefix auth-service

# Rollback to previous version
aws ecs update-service \
  --cluster finance-platform-cluster \
  --service auth-service \
  --task-definition auth-service:PREVIOUS_VERSION
```

---

## 🧪 Load Testing Auto-Scaling

Test your auto-scaling configuration:

```bash
# Install load testing tool
npm install -g artillery

# Create load test config
cat > load-test.yml <<EOF
config:
  target: http://YOUR_ALB_DNS
  phases:
    - duration: 60
      arrivalRate: 10  # 10 req/sec
      name: "Warm up"
    - duration: 300
      arrivalRate: 100  # 100 req/sec
      name: "Sustained load"
    - duration: 60
      arrivalRate: 200  # 200 req/sec
      name: "Spike"
scenarios:
  - name: "Health check"
    flow:
      - get:
          url: "/api/v1/health"
  - name: "Login"
    flow:
      - post:
          url: "/api/v1/auth/login"
          json:
            email: "test@example.com"
            password: "TestPassword123!"
EOF

# Run load test
artillery run load-test.yml

# Monitor auto-scaling in CloudWatch
# You should see tasks increase as load increases
```

---

## 💰 Cost Optimization

### Tips to Reduce Costs

1. **Use Spot Instances for Non-Critical Services**
   ```hcl
   capacity_provider_strategy {
     capacity_provider = "FARGATE_SPOT"
     weight            = 1
     base              = 0
   }
   ```

2. **Reduce Min Tasks During Off-Hours**
   - Use scheduled scaling (shown above)
   - Scale to 1 task during nights/weekends

3. **Optimize Container Sizes**
   - Use smaller CPU/memory sizes where possible
   - Monitor actual usage and adjust

4. **Enable Cost Allocation Tags**
   ```hcl
   tags = {
     CostCenter = "engineering"
     Service    = "auth-service"
   }
   ```

5. **Use RDS Free Tier**
   - db.t3.micro is free for 12 months
   - 20 GB storage free

---

## 🚨 Troubleshooting

### Tasks Won't Start

```bash
# Check service events
aws ecs describe-services \
  --cluster finance-platform-cluster \
  --services auth-service \
  --query 'services[0].events[0:10]'

# Check task definition
aws ecs describe-task-definition \
  --task-definition auth-service:LATEST

# Check CloudWatch logs
aws logs tail /ecs/auth-service --follow
```

### Auto-Scaling Not Working

```bash
# Check scaling policies
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs

# Check scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id "service/finance-platform-cluster/auth-service"

# Check CloudWatch alarms
aws cloudwatch describe-alarms
```

### High Costs

```bash
# Check current costs
aws ce get-cost-and-usage \
  --time-period Start=2024-03-01,End=2024-03-31 \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Service

# Identify most expensive services
# Consider reducing max_tasks or using Spot instances
```

---

## ✅ Checklist

- [ ] ECR repositories created
- [ ] Docker images pushed to ECR
- [ ] Terraform variables configured
- [ ] Database password set securely
- [ ] Terraform applied successfully
- [ ] ALB health checks passing
- [ ] All services running with min tasks
- [ ] Auto-scaling policies active
- [ ] CloudWatch alarms configured
- [ ] SNS alerts setup
- [ ] Load testing completed
- [ ] Monitoring dashboard created
- [ ] Cost alerts configured

---

## 📚 Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/)
- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)

---

**Ready to deploy?** Run `terraform apply` and your auto-scaling microservices will be live! 🚀
