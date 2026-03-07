provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "network" {
  source               = "./modules/network"
  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  azs                  = local.azs
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = local.common_tags
}

module "ecr" {
  source        = "./modules/ecr"
  project_name  = var.project_name
  environment   = var.environment
  service_names = var.service_names
  tags          = local.common_tags
}

module "eks" {
  source             = "./modules/eks"
  project_name       = var.project_name
  environment        = var.environment
  kubernetes_version = var.kubernetes_version
  # Use public subnets when private subnets are empty (for cost optimization)
  subnet_ids         = length(var.private_subnet_cidrs) > 0 ? module.network.private_subnet_ids : module.network.public_subnet_ids
  node_subnet_ids    = length(var.private_subnet_cidrs) > 0 ? module.network.private_subnet_ids : module.network.public_subnet_ids
  cluster_sg_id      = module.network.eks_cluster_sg_id
  node_sg_id         = module.network.eks_node_sg_id
  instance_types     = var.node_instance_types
  desired_size       = var.desired_size
  min_size           = var.min_size
  max_size           = var.max_size
  tags               = local.common_tags
}
