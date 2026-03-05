# Terraform (AWS Free-Tier Friendly Baseline)

This stack provisions reusable modules for:
- VPC with public/private subnets, IGW, NAT, and route tables
- Security groups for EKS control plane and nodes
- ECR repositories per microservice
- EKS cluster + minimal managed node group

## Usage
```bash
cd infrastructure/terraform
cp environments/dev/terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

> Cost note: NAT Gateway is not free tier. For lowest-cost learning, run only during labs or replace NAT with private-only endpoints later.
