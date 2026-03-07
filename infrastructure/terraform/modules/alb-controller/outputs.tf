output "alb_controller_role_arn" {
  description = "ARN of IAM role for ALB controller"
  value       = aws_iam_role.alb_controller.arn
}

output "alb_controller_policy_arn" {
  description = "ARN of IAM policy for ALB controller"
  value       = aws_iam_policy.alb_controller.arn
}

output "oidc_provider_arn" {
  description = "ARN of OIDC provider"
  value       = var.create_oidc_provider ? aws_iam_openid_connect_provider.eks[0].arn : var.oidc_provider_arn
}
