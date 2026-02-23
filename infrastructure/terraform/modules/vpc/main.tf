# =============================================================
# infrastructure/terraform/modules/vpc/main.tf
# VPC with public/private subnets across multiple AZs
# Generic — reuse for any project by changing variables
# =============================================================

# ── VPC ───────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true  # Required for EKS
  enable_dns_support   = true

  tags = {
    Name = "${var.env}-vpc"
    # Required tags for EKS to find the VPC
    "kubernetes.io/cluster/${var.env}-cluster" = "shared"
  }
}

# ── Internet Gateway (for public subnets) ─────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.env}-igw" }
}

# ── Public Subnets (ALB lives here) ───────────────────────────
resource "aws_subnet" "public" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)        # 10.0.0.0/24, 10.0.1.0/24, ...
  availability_zone = var.availability_zones[count.index]
  map_public_ip_on_launch = true  # Instances get public IPs

  tags = {
    Name = "${var.env}-public-${var.availability_zones[count.index]}"
    "kubernetes.io/role/elb"                              = "1"  # ALB discovery
    "kubernetes.io/cluster/${var.env}-cluster"            = "shared"
  }
}

# ── Private Subnets (EKS nodes, RDS live here) ────────────────
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)   # 10.0.10.0/24, 10.0.11.0/24, ...
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${var.env}-private-${var.availability_zones[count.index]}"
    "kubernetes.io/role/internal-elb"                     = "1"  # Internal ALB
    "kubernetes.io/cluster/${var.env}-cluster"            = "owned"
  }
}

# ── Elastic IPs for NAT Gateways ──────────────────────────────
resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"
  tags   = { Name = "${var.env}-nat-eip-${count.index}" }
}

# ── NAT Gateways (allow private subnets to reach internet) ────
# COST: Each NAT Gateway costs ~$35/month + data transfer
# For cost savings: use count = 1 (single NAT) but lose HA
resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)  # One per AZ for HA
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "${var.env}-nat-${var.availability_zones[count.index]}" }
  depends_on = [aws_internet_gateway.main]
}

# ── Route Tables ──────────────────────────────────────────────
# Public: route to internet via IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.env}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private: route to internet via NAT gateway
resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
  tags = { Name = "${var.env}-private-rt-${count.index}" }
}

resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ── Security Groups ───────────────────────────────────────────
# ALB: accepts public HTTPS
resource "aws_security_group" "alb" {
  name        = "${var.env}-alb-sg"
  description = "Allow HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.env}-alb-sg" }
}
