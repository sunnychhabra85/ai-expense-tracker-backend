#!/bin/sh
set -e

echo "[localstack-init] Bootstrapping S3 and SQS resources..."

BUCKET_NAME="finance-platform-uploads-dev"

# Create S3 bucket if missing.
awslocal s3api head-bucket --bucket "$BUCKET_NAME" >/dev/null 2>&1 || awslocal s3 mb "s3://$BUCKET_NAME"

# Create SQS queues if missing.
awslocal sqs get-queue-url --queue-name document-processing-dlq >/dev/null 2>&1 || awslocal sqs create-queue --queue-name document-processing-dlq
awslocal sqs get-queue-url --queue-name document-processing >/dev/null 2>&1 || awslocal sqs create-queue --queue-name document-processing --attributes VisibilityTimeout=300

# Apply bucket CORS for local UI origins and presigned uploads.
cat >/tmp/s3-cors.json <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8081"
      ],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

awslocal s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration file:///tmp/s3-cors.json

echo "[localstack-init] Completed resource bootstrap and S3 CORS setup."
