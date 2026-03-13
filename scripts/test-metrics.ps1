# Test Metrics Endpoints
# This script tests all microservice metrics endpoints

Write-Host "`n=== Testing Metrics Endpoints ===" -ForegroundColor Cyan
Write-Host "Testing all services for Prometheus metrics availability`n" -ForegroundColor Gray

$services = @(
    @{Name="API Gateway"; Port=3000},
    @{Name="Auth Service"; Port=3001},
    @{Name="Upload Service"; Port=3002},
    @{Name="Processing Service"; Port=3003},
    @{Name="Analytics Service"; Port=3004},
    @{Name="Notification Service"; Port=3005}
)

$results = @()

foreach ($service in $services) {
    Write-Host "Testing $($service.Name) on port $($service.Port)..." -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($service.Port)/metrics" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        
        $status = if ($response.StatusCode -eq 200) { "[OK] PASS" } else { "[X] FAIL" }
        $color = if ($response.StatusCode -eq 200) { "Green" } else { "Red" }
        
        Write-Host " $status" -ForegroundColor $color
        Write-Host "  Status: $($response.StatusCode) | Size: $($response.Content.Length) bytes" -ForegroundColor Gray
        
        # Check for expected metrics
        $content = $response.Content
        $hasProcessMetrics = $content -match "process_cpu_user_seconds_total"
        $hasHttpMetrics = $content -match "http_requests_total"
        
        if ($hasProcessMetrics -and $hasHttpMetrics) {
            Write-Host "  Metrics: Process [OK] | HTTP [OK]" -ForegroundColor Gray
        } else {
            Write-Host "  Metrics: Process $(if($hasProcessMetrics){'[OK]'}else{'[X]'}) | HTTP $(if($hasHttpMetrics){'[OK]'}else{'[X]'})" -ForegroundColor Yellow
        }
        
        $results += @{
            Service = $service.Name
            Port = $service.Port
            Status = "Running"
            StatusCode = $response.StatusCode
            Size = $response.Content.Length
            HasMetrics = ($hasProcessMetrics -and $hasHttpMetrics)
        }
    }
    catch {
        Write-Host " [X] FAIL" -ForegroundColor Red
        
        if ($_.Exception.Message -match "Unable to connect") {
            Write-Host "  Error: Service not running" -ForegroundColor Red
        } else {
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        $results += @{
            Service = $service.Name
            Port = $service.Port
            Status = "Not Running"
            StatusCode = "N/A"
            Size = 0
            HasMetrics = $false
        }
    }
    
    Write-Host ""
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$running = ($results | Where-Object { $_.Status -eq "Running" }).Count
$total = $results.Count
$metricsWorking = ($results | Where-Object { $_.HasMetrics -eq $true }).Count

Write-Host "Services Running: $running / $total" -ForegroundColor $(if($running -eq $total){"Green"}else{"Yellow"})
Write-Host "Metrics Working: $metricsWorking / $running" -ForegroundColor $(if($metricsWorking -eq $running){"Green"}else{"Yellow"})

if ($running -eq $total -and $metricsWorking -eq $total) {
    Write-Host "`n[OK] All services are running and exposing metrics correctly!" -ForegroundColor Green
} elseif ($running -eq 0) {
    Write-Host "`n[X] No services are running. Start services first:" -ForegroundColor Red
    Write-Host "  npx nx serve <service-name>" -ForegroundColor Gray
} else {
    Write-Host "`n[!] Some services are not running or metrics are not working." -ForegroundColor Yellow
    Write-Host "Start missing services with: npx nx serve <service-name>" -ForegroundColor Gray
}

# Detailed Results
Write-Host "`n=== Detailed Results ===" -ForegroundColor Cyan
$results | Format-Table -Property Service, Port, Status, StatusCode, @{Label="Size (bytes)"; Expression={$_.Size}}, @{Label="Has Metrics"; Expression={if($_.HasMetrics){"Yes"}else{"No"}}} -AutoSize
