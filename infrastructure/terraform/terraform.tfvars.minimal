# ========================================
# COST-OPTIMIZED TERRAFORM CONFIGURATION
# For short-term testing (5 hours)
# Estimated cost: ~$0.60 for 5 hours vs $1.89
# ========================================

# Basic Configuration
aws_region   = "ap-south-1"
project_name = "finance-platform"
environment  = "dev-minimal"  # Different name to avoid conflicts

# Network Configuration
# Using smaller CIDR blocks since we need minimal resources
vpc_cidr             = "10.20.0.0/16"
public_subnet_cidrs  = ["10.20.1.0/24", "10.20.2.0/24"]
private_subnet_cidrs = []  # Empty - we'll use public subnets for nodes

# EKS Configuration
kubernetes_version = "1.30"  # Updated to supported version

# ========================================
# COST SAVINGS: Use 1 t3.small instead of 2 t3.medium
# Savings: $0.062/hour ($0.31 over 5 hours)
# ========================================
node_instance_types = ["t3.small"]  # $0.021/hour vs t3.medium $0.0416/hour
desired_size        = 1             # Single node instead of 2
min_size            = 1
max_size            = 2

# Services (same as before)
service_names = [
  "auth-service",
  "upload-service",
  "processing-service",
  "analytics-service",
  "notification-service"
]

# ========================================
# ADDITIONAL COST OPTIMIZATIONS
# ========================================
# 1. No NAT Gateway (saves $0.27 for 5 hours)
#    - Nodes will be in public subnets
#    - Still secure with security groups
#
# 2. Single node (saves $0.21 for 5 hours)
#    - Enough for testing with light load
#    - Can scale to 2 if needed
#
# 3. Spot instances (optional, add to EKS module)
#    - Can save up to 70% on compute
#    - node_capacity_type = "SPOT"
#
# 4. Skip RDS/ElastiCache for initial testing
#    - Use in-cluster PostgreSQL/Redis
#    - Saves $0.20 for 5 hours
# ========================================

# Total 5-hour cost comparison:
# Standard setup:    $1.89
# This config:       $0.60
# Savings:           $1.29 (68% reduction)
