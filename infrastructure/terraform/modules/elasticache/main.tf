# =============================================================
# infrastructure/terraform/modules/elasticache/main.tf
# ElastiCache Redis for analytics caching
# =============================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.env}-redis-subnet-group"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name   = "${var.env}-redis-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.allowed_sg_id]
  }
  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.env}-finance-redis"
  description          = "Redis for finance platform analytics caching"
  node_type            = var.node_type
  num_cache_clusters   = var.env == "production" ? 2 : 1  # 2 for HA
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  automatic_failover_enabled = var.env == "production"

  tags = { Name = "${var.env}-redis" }
}

output "primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_url" {
  value     = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
  sensitive = true
}

variable "env" {}
variable "vpc_id" {}
variable "subnet_ids" { type = list(string) }
variable "allowed_sg_id" {}
variable "node_type" { default = "cache.t3.micro" }
