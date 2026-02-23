# =============================================================
# infrastructure/terraform/modules/ecr/main.tf
# ECR repositories for all services — generic module
# Call once per service: module "ecr_upload" { service = "upload-service" }
# =============================================================

resource "aws_ecr_repository" "service" {
  name                 = var.service_name
  image_tag_mutability = "MUTABLE"  # Allow 'latest' tag to be updated

  # Scan images on push — detects known CVEs automatically (free)
  image_scanning_configuration {
    scan_on_push = true
  }

  # Encryption
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${var.env}-${var.service_name}" }
}

# ── Lifecycle policy ──────────────────────────────────────────
# Keep only the last 10 images — prevents ECR storage costs from growing
resource "aws_ecr_lifecycle_policy" "service" {
  repository = aws_ecr_repository.service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

output "repository_url" {
  value = aws_ecr_repository.service.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.service.arn
}

variable "env" {}
variable "service_name" {}
