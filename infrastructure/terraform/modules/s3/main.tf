# =============================================================
# infrastructure/terraform/modules/s3/main.tf
# S3 bucket for PDF uploads — secure, encrypted, with lifecycle
# =============================================================

# ── Upload bucket ─────────────────────────────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.env}-finance-platform-uploads"

  tags = { Name = "${var.env}-uploads-bucket" }
}

# ── Block ALL public access ───────────────────────────────────
# Files are accessed via presigned URLs only — never public
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Encryption at rest ────────────────────────────────────────
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"  # S3-managed keys (free)
      # Use aws:kms with a KMS key for stricter compliance requirements
    }
    bucket_key_enabled = true   # Reduces KMS API calls if you switch to KMS later
  }
}

# ── Versioning ────────────────────────────────────────────────
# Allows recovery if a file is accidentally overwritten
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ── Lifecycle rules ────────────────────────────────────────────
# COST SAVINGS: Move old files to cheaper storage tiers automatically
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  # Move files to Glacier after 90 days (much cheaper for cold storage)
  rule {
    id     = "archive-old-uploads"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"  # Instant Retrieval Glacier
    }

    # Hard delete after 365 days (adjust for compliance requirements)
    expiration {
      days = 365
    }

    # Clean up incomplete multipart uploads after 7 days (prevents hidden costs!)
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Delete old versions after 30 days
  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ── CORS configuration ────────────────────────────────────────
# Required so browsers can PUT files directly to S3
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]  # Only PUT — no GET/DELETE from browser
    allowed_origins = var.allowed_origins  # e.g., ["https://yourdomain.com"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ── S3 Event Notification → SQS ──────────────────────────────
# Automatically triggers when a PDF is uploaded to S3
# This is an ALTERNATIVE to the confirm endpoint approach.
# Current approach: frontend calls /upload/confirm → service publishes to SQS
# Optional: enable this for fully event-driven uploads without confirm step
#
# resource "aws_s3_bucket_notification" "uploads" {
#   bucket = aws_s3_bucket.uploads.id
#   queue {
#     queue_arn     = var.sqs_queue_arn
#     events        = ["s3:ObjectCreated:Put"]
#     filter_prefix = "uploads/"
#     filter_suffix = ".pdf"
#   }
# }

# ── Bucket policy: enforce HTTPS only ─────────────────────────
resource "aws_s3_bucket_policy" "uploads_https_only" {
  bucket = aws_s3_bucket.uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonHttps"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          aws_s3_bucket.uploads.arn,
          "${aws_s3_bucket.uploads.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

# ── Outputs ───────────────────────────────────────────────────
output "uploads_bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "uploads_bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}

# ── Variables ────────────────────────────────────────────────
variable "env" {}
variable "allowed_origins" {
  type    = list(string)
  default = ["https://yourdomain.com"]
}
