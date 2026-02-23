# =============================================================
# infrastructure/terraform/modules/iam/upload_service.tf
# IRSA role for upload-service — S3 write + SQS send only
# Append this to modules/iam/main.tf OR keep as separate file
# =============================================================

# ── Upload Service IRSA Role ──────────────────────────────────
resource "aws_iam_role" "upload_service" {
  name = "${var.env}-upload-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" = "system:serviceaccount:finance:upload-service-sa"
          "${replace(var.oidc_provider_url, "https://", "")}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "upload_service" {
  name = "upload-service-permissions"
  role = aws_iam_role.upload_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ── S3: generate presigned PUT URLs + HeadObject ──────────
      # PutObject is allowed via presigned URL (user uploads directly)
      # HeadObject lets service verify file existence after upload
      # DeleteObject lets service clean up invalid uploads
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",       # Generate presigned PUT URL
          "s3:GetObject",       # Read files (needed for HeadObject too)
          "s3:HeadObject",      # Verify file exists after upload
          "s3:DeleteObject",    # Clean up invalid uploads
        ]
        Resource = "${var.s3_bucket_arn}/uploads/*"  # Scoped to uploads/ prefix only
      },

      # ── SQS: publish messages to processing queue ─────────────
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = var.sqs_queue_arn
      },

      # ── Secrets Manager: read upload-service secrets ──────────
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = var.secrets_arns
      },

      # ── CloudWatch Logs ───────────────────────────────────────
      {
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# ── Kubernetes ServiceAccount for upload-service ──────────────
resource "kubernetes_service_account" "upload_service" {
  metadata {
    name      = "upload-service-sa"
    namespace = "finance"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.upload_service.arn
    }
  }
}

output "upload_service_role_arn" {
  value = aws_iam_role.upload_service.arn
}
