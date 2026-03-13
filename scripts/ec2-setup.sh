#!/bin/bash

#######################################################
# EC2 Instance Setup Script for Finance Platform
# Designed for Amazon Linux 2023 / Ubuntu
# Usage: sudo bash ec2-setup.sh
#######################################################

set -e  # Exit on any error

echo "========================================="
echo "Finance Platform - EC2 Setup"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

echo "Detected OS: $OS"

#--------------------------------------------------
# 1. System Updates
#--------------------------------------------------
echo ""
echo "[1/8] Updating system packages..."

if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    yum update -y
    yum install -y git curl wget vim htop
elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update
    apt-get upgrade -y
    apt-get install -y git curl wget vim htop
else
    echo "Unsupported OS: $OS"
    exit 1
fi

#--------------------------------------------------
# 2. Install Docker
#--------------------------------------------------
echo ""
echo "[2/8] Installing Docker..."

if ! command -v docker &> /dev/null; then
    if [ "$OS" = "amzn" ]; then
        yum install -y docker
        systemctl enable docker
        systemctl start docker
    elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get install -y docker.io
        systemctl enable docker
        systemctl start docker
    fi
    
    # Add ec2-user to docker group (for Amazon Linux)
    if id "ec2-user" &>/dev/null; then
        usermod -aG docker ec2-user
    fi
    
    # Add ubuntu user to docker group (for Ubuntu)
    if id "ubuntu" &>/dev/null; then
        usermod -aG docker ubuntu
    fi
    
    echo "Docker installed successfully"
else
    echo "Docker already installed"
fi

docker --version

#--------------------------------------------------
# 3. Install Docker Compose
#--------------------------------------------------
echo ""
echo "[3/8] Installing Docker Compose..."

if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION="2.24.5"
    curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    echo "Docker Compose installed successfully"
else
    echo "Docker Compose already installed"
fi

docker-compose --version

#--------------------------------------------------
# 4. Install Node.js (for building)
#--------------------------------------------------
echo ""
echo "[4/8] Installing Node.js 20..."

if ! command -v node &> /dev/null; then
    curl -sL https://rpm.nodesource.com/setup_20.x | bash -
    
    if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
        yum install -y nodejs
    elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get install -y nodejs
    fi
    
    echo "Node.js installed successfully"
else
    echo "Node.js already installed"
fi

node --version
npm --version

#--------------------------------------------------
# 5. Install AWS CLI
#--------------------------------------------------
echo ""
echo "[5/8] Installing AWS CLI..."

if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -q awscliv2.zip
    ./aws/install
    rm -rf aws awscliv2.zip
    echo "AWS CLI installed successfully"
else
    echo "AWS CLI already installed"
fi

aws --version

#--------------------------------------------------
# 6. Configure System for Production
#--------------------------------------------------
echo ""
echo "[6/8] Configuring system limits..."

# Increase file descriptors
cat >> /etc/security/limits.conf <<EOF
* soft nofile 65535
* hard nofile 65535
EOF

# Disable swap (not needed for t2.micro with limited RAM)
swapoff -a

# Enable memory overcommit (for Redis)
echo "vm.overcommit_memory=1" >> /etc/sysctl.conf
sysctl -p

#--------------------------------------------------
# 7. Setup Application Directory
#--------------------------------------------------
echo ""
echo "[7/8] Setting up application directory..."

APP_DIR="/opt/finance-platform"
mkdir -p $APP_DIR

# Set appropriate permissions
if id "ec2-user" &>/dev/null; then
    chown -R ec2-user:ec2-user $APP_DIR
elif id "ubuntu" &>/dev/null; then
    chown -R ubuntu:ubuntu $APP_DIR
fi

echo "Application directory created: $APP_DIR"

#--------------------------------------------------
# 8. Configure Firewall (Security Group should handle this)
#--------------------------------------------------
echo ""
echo "[8/8] Final configurations..."

# Create systemd service for auto-start
cat > /etc/systemd/system/finance-platform.service <<'EOF'
[Unit]
Description=Finance Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/finance-platform
ExecStart=/usr/local/bin/docker-compose -f docker-compose.production.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.production.yml down
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "Systemd service created"

#--------------------------------------------------
# Complete
#--------------------------------------------------
echo ""
echo "========================================="
echo "✅ EC2 Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to /opt/finance-platform"
echo "2. Create .env.production file with your secrets"
echo "3. Run: docker-compose -f docker-compose.production.yml up -d --build"
echo ""
echo "Useful commands:"
echo "  - Check status: docker ps"
echo "  - View logs: docker-compose -f docker-compose.production.yml logs -f"
echo "  - Restart: docker-compose -f docker-compose.production.yml restart"
echo "  - Stop: docker-compose -f docker-compose.production.yml down"
echo ""
echo "NOTE: You may need to log out and log back in for docker group changes to take effect"
echo ""
