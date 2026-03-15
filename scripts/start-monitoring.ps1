# =============================================================
# Start Monitoring Stack (Prometheus + Grafana)
# =============================================================

Write-Host "`n=== Starting AI Finance Monitoring Stack ===" -ForegroundColor Cyan
Write-Host "This will start Prometheus and Grafana in Docker containers`n" -ForegroundColor Gray

# Check if Docker is running
Write-Host "Checking Docker..." -NoNewline
try {
    docker ps | Out-Null
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host "Error: Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Stop existing containers if any
Write-Host "`nStopping existing monitoring containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml down 2>$null

# Start monitoring stack
Write-Host "`nStarting monitoring stack..." -ForegroundColor Cyan
docker-compose -f docker-compose.monitoring.yml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Monitoring stack started successfully!" -ForegroundColor Green
    
    Write-Host "`n=== Access URLs ===" -ForegroundColor Cyan
    Write-Host "Prometheus: " -NoNewline -ForegroundColor White
    Write-Host "http://localhost:9090" -ForegroundColor Yellow
    Write-Host "Grafana:    " -NoNewline -ForegroundColor White
    Write-Host "http://localhost:3100" -ForegroundColor Yellow
    Write-Host "            Username: " -NoNewline -ForegroundColor Gray
    Write-Host "admin" -ForegroundColor White
    Write-Host "            Password: " -NoNewline -ForegroundColor Gray
    Write-Host "admin" -ForegroundColor White
    
    Write-Host "`n=== Checking Services ===" -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    
    # Check if Prometheus is accessible
    Write-Host "Prometheus: " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9090/-/healthy" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "[OK]" -ForegroundColor Green
    } catch {
        Write-Host "[WAIT] Starting up..." -ForegroundColor Yellow
    }
    
    # Check if Grafana is accessible
    Write-Host "Grafana:    " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3100/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "[OK]" -ForegroundColor Green
    } catch {
        Write-Host "[WAIT] Starting up..." -ForegroundColor Yellow
    }
    
    Write-Host "`n=== Available Dashboards ===" -ForegroundColor Cyan
    Write-Host "1. AI Finance - Microservices Overview" -ForegroundColor White
    Write-Host "   All services health, request rates, errors" -ForegroundColor Gray
    Write-Host "`n2. AI Finance - Service Details" -ForegroundColor White
    Write-Host "   Deep dive into individual service metrics" -ForegroundColor Gray
    
    Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
    Write-Host "1. Start your microservices:" -ForegroundColor White
    Write-Host "   " -NoNewline
    Write-Host "`$env:SERVICE_NAME='auth-service'; npx nx serve auth-service" -ForegroundColor Gray
    Write-Host "`n2. Open Grafana at http://localhost:3100" -ForegroundColor White
    Write-Host "`n3. Login with admin/admin" -ForegroundColor White
    Write-Host "`n4. Navigate to Dashboards > AI Finance" -ForegroundColor White
    
    Write-Host "`n=== Useful Commands ===" -ForegroundColor Cyan
    Write-Host "View logs:    " -NoNewline -ForegroundColor White
    Write-Host "docker-compose -f docker-compose.monitoring.yml logs -f" -ForegroundColor Gray
    Write-Host "Stop stack:   " -NoNewline -ForegroundColor White
    Write-Host "docker-compose -f docker-compose.monitoring.yml down" -ForegroundColor Gray
    Write-Host "Restart:      " -NoNewline -ForegroundColor White
    Write-Host "docker-compose -f docker-compose.monitoring.yml restart" -ForegroundColor Gray
    
} else {
    Write-Host "`n[FAIL] Failed to start monitoring stack" -ForegroundColor Red
    Write-Host "Check the error messages above for details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
