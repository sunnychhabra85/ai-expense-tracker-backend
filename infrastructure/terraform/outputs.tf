output "vpc_id" { value = module.network.vpc_id }
output "private_subnet_ids" { value = module.network.private_subnet_ids }
output "public_subnet_ids" { value = module.network.public_subnet_ids }
output "ecr_repository_urls" { value = module.ecr.repository_urls }
output "eks_cluster_name" { value = module.eks.cluster_name }
output "eks_cluster_endpoint" { value = module.eks.cluster_endpoint }
output "alb_controller_role_arn" { 
  description = "ARN of IAM role for ALB controller"
  value       = var.enable_alb_controller ? module.alb_controller.alb_controller_role_arn : null 
}
output "oidc_provider_arn" { 
  description = "ARN of OIDC provider for EKS"
  value       = var.enable_alb_controller ? module.alb_controller.oidc_provider_arn : null 
}
