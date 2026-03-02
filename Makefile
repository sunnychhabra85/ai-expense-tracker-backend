# =============================================================================
# Makefile - Upload Service Testing & Deployment
# Cross-platform shortcuts for local-first DevOps workflow
# =============================================================================
# Usage:
#   make test-quick      # Pre-commit test (30s)
#   make test-full       # Full local test (3-5min)
#   make test-probes     # Validate health probes
#   make build           # Build Docker image
#   make up              # Start all services
#   make logs            # View upload-service logs
#   make clean           # Stop and remove all containers
# =============================================================================

.PHONY: help test-quick test-full test-probes build up down logs clean validate deploy

# Default target
help:
	@echo ""
	@echo "Upload Service - Local Testing Commands"
	@echo "========================================"
	@echo ""
	@echo "Quick Tests:"
	@echo "  make test-quick     - Pre-commit test (30s)"
	@echo "  make test-full      - Full CI/CD simulation (3-5min)"
	@echo "  make test-probes    - Validate liveness/readiness probes"
	@echo ""
	@echo "Docker:"
	@echo "  make build          - Build Docker image"
	@echo "  make up             - Start all services"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart upload-service"
	@echo "  make logs           - View upload-service logs"
	@echo ""
	@echo "Validation:"
	@echo "  make validate       - Validate K8s manifests"
	@echo "  make lint           - Run ESLint"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Remove containers and volumes"
	@echo "  make clean-all      - Full cleanup (images, cache)"
	@echo ""

# ══════════════════════════════════════════════════════════════════════════
# Testing
# ══════════════════════════════════════════════════════════════════════════

test-quick:
	@echo "🚀 Running quick pre-commit test..."
ifeq ($(OS),Windows_NT)
	@powershell -File scripts/quick-test-upload.ps1
else
	@./scripts/quick-test-upload.sh
endif

test-full:
	@echo "🚀 Running full local-first DevOps test..."
ifeq ($(OS),Windows_NT)
	@powershell -File scripts/test-upload-service-local.ps1
else
	@./scripts/test-upload-service-local.sh
endif

test-probes:
	@echo "🩺 Validating health probes..."
ifeq ($(OS),Windows_NT)
	@powershell -File scripts/validate-health-probes.ps1
else
	@echo "Health probe validator not yet implemented for Linux/Mac"
endif

test-stress:
	@echo "💪 Running stress test..."
ifeq ($(OS),Windows_NT)
	@powershell -File scripts/validate-health-probes.ps1 -StressTest
else
	@echo "Stress test not yet implemented for Linux/Mac"
endif

# ══════════════════════════════════════════════════════════════════════════
# Docker Operations
# ══════════════════════════════════════════════════════════════════════════

build:
	@echo "🔨 Building Docker image..."
	docker build -t upload-service:local -f apps/upload-service/Dockerfile .

build-no-cache:
	@echo "🔨 Building Docker image (no cache)..."
	docker build --no-cache -t upload-service:local -f apps/upload-service/Dockerfile .

up:
	@echo "🚀 Starting all services..."
	docker-compose up -d
	@echo "⏳ Waiting for services to be healthy..."
	@sleep 5
	@docker-compose ps

up-upload:
	@echo "🚀 Starting upload-service only..."
	docker-compose up -d postgres localstack upload-service

down:
	@echo "🛑 Stopping all services..."
	docker-compose down

restart:
	@echo "🔄 Restarting upload-service..."
	docker-compose restart upload-service
	@sleep 3
	@docker-compose ps upload-service

logs:
	@echo "📋 Tailing upload-service logs..."
	docker-compose logs -f upload-service

logs-all:
	@echo "📋 Tailing all service logs..."
	docker-compose logs -f

ps:
	@echo "📊 Container status:"
	@docker-compose ps

# ══════════════════════════════════════════════════════════════════════════
# Development
# ══════════════════════════════════════════════════════════════════════════

lint:
	@echo "🔍 Running ESLint..."
	npx nx lint upload-service

lint-fix:
	@echo "🔧 Running ESLint with auto-fix..."
	npx nx lint upload-service --fix

format:
	@echo "✨ Formatting code with Prettier..."
	npx prettier --write "apps/upload-service/**/*.ts"

test-unit:
	@echo "🧪 Running unit tests..."
	npx nx test upload-service

test-watch:
	@echo "👀 Running tests in watch mode..."
	npx nx test upload-service --watch

# ══════════════════════════════════════════════════════════════════════════
# Database
# ══════════════════════════════════════════════════════════════════════════

db-migrate:
	@echo "🗄️ Running database migrations..."
	DATABASE_URL=postgresql://admin:localpassword123@localhost:5432/financedb \
	npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma

db-generate:
	@echo "⚙️ Generating Prisma client..."
	npx prisma generate --schema=libs/database/prisma/schema.prisma

db-studio:
	@echo "🎨 Opening Prisma Studio..."
	DATABASE_URL=postgresql://admin:localpassword123@localhost:5432/financedb \
	npx prisma studio --schema=libs/database/prisma/schema.prisma

db-reset:
	@echo "⚠️ Resetting database (WARNING: destroys data)..."
	DATABASE_URL=postgresql://admin:localpassword123@localhost:5432/financedb \
	npx prisma migrate reset --schema=libs/database/prisma/schema.prisma

# ══════════════════════════════════════════════════════════════════════════
# Validation & Health Checks
# ══════════════════════════════════════════════════════════════════════════

validate:
	@echo "✅ Validating Kubernetes manifests..."
	kubectl apply -f infrastructure/k8s/namespace.yaml --dry-run=client
	kubectl apply -f infrastructure/k8s/upload-service/deployment.yaml --dry-run=client

health:
	@echo "🩺 Checking service health..."
ifeq ($(OS),Windows_NT)
	@powershell -Command "Invoke-RestMethod -Uri http://localhost:3002/api/v1/health | ConvertTo-Json"
else
	@curl -s http://localhost:3002/api/v1/health | jq .
endif

ready:
	@echo "🩺 Checking readiness..."
ifeq ($(OS),Windows_NT)
	@powershell -Command "Invoke-RestMethod -Uri http://localhost:3002/api/v1/health/ready | ConvertTo-Json"
else
	@curl -s http://localhost:3002/api/v1/health/ready | jq .
endif

# ══════════════════════════════════════════════════════════════════════════
# Cleanup
# ══════════════════════════════════════════════════════════════════════════

clean:
	@echo "🧹 Cleaning up containers and volumes..."
	docker-compose down -v

clean-all:
	@echo "🧹 Full cleanup (containers, volumes, images, cache)..."
	docker-compose down -v --rmi all
	docker system prune -af --volumes

clean-logs:
	@echo "🧹 Cleaning Docker logs..."
	docker-compose down
	docker system prune -f

# ══════════════════════════════════════════════════════════════════════════
# AWS & Infrastructure
# ══════════════════════════════════════════════════════════════════════════

aws-localstack:
	@echo "☁️ Checking LocalStack status..."
ifeq ($(OS),Windows_NT)
	@powershell -Command "Invoke-RestMethod -Uri http://localhost:4566/_localstack/health | ConvertTo-Json"
else
	@curl -s http://localhost:4566/_localstack/health | jq .
endif

aws-s3-list:
	@echo "📦 Listing S3 buckets in LocalStack..."
	aws --endpoint-url=http://localhost:4566 s3 ls

aws-sqs-list:
	@echo "📬 Listing SQS queues in LocalStack..."
	aws --endpoint-url=http://localhost:4566 sqs list-queues

# ══════════════════════════════════════════════════════════════════════════
# CI/CD Simulation
# ══════════════════════════════════════════════════════════════════════════

ci-test:
	@echo "🤖 Running CI test job..."
	npm ci --frozen-lockfile
	npx prisma generate --schema=libs/database/prisma/schema.prisma
	npx nx lint upload-service
	npx nx test upload-service --passWithNoTests

ci-build:
	@echo "🤖 Running CI build job..."
	docker build -t upload-service:$(shell git rev-parse --short HEAD) -f apps/upload-service/Dockerfile .

ci-full: ci-test ci-build test-probes
	@echo "✅ CI/CD simulation complete!"

# ══════════════════════════════════════════════════════════════════════════
# Pre-commit & Pre-push Hooks
# ══════════════════════════════════════════════════════════════════════════

pre-commit: lint test-unit
	@echo "✅ Pre-commit checks passed!"

pre-push: test-full
	@echo "✅ Pre-push checks passed! Safe to deploy."

# ══════════════════════════════════════════════════════════════════════════
# Monitoring
# ══════════════════════════════════════════════════════════════════════════

stats:
	@echo "📊 Container resource usage:"
	@docker stats --no-stream finance_upload

top:
	@echo "📊 Real-time resource monitoring:"
	@docker stats finance_upload

inspect:
	@echo "🔍 Container details:"
	@docker inspect finance_upload | jq '.[0] | {State, Config: {Env, ExposedPorts}, NetworkSettings: {IPAddress, Ports}}'

# ══════════════════════════════════════════════════════════════════════════
# Documentation
# ══════════════════════════════════════════════════════════════════════════

docs:
	@echo "📚 Opening documentation..."
	@echo ""
	@echo "Available guides:"
	@echo "  docs/LOCAL_TESTING_STRATEGY.md"
	@echo "  docs/DEPLOYMENT_CHECKLIST.md"
	@echo ""

# ══════════════════════════════════════════════════════════════════════════
# All-in-one commands
# ══════════════════════════════════════════════════════════════════════════

all: clean up db-migrate test-full
	@echo "✅ Complete setup and test finished!"

dev: up logs
	@echo "🚀 Development environment running"

prod-ready: clean-all test-full validate
	@echo "🚀 Production deployment validated and ready!"
