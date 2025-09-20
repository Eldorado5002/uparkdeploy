# PowerShell Deployment Test Script for UPark Backend

Write-Host "🧪 Testing UPark Backend Deployment" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$BackendUrl = "https://uparkdeployback.onrender.com"

Write-Host "`n🔍 Testing Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/health" -Method GET -ContentType "application/json"
    Write-Host "✅ Health Check: $($response.status)" -ForegroundColor Green
    Write-Host "   Database: $($response.database.connected)" -ForegroundColor Green
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🔍 Testing CORS..." -ForegroundColor Yellow
try {
    $headers = @{
        'Content-Type' = 'application/json'
        'Origin' = 'https://uparkdeploy.onrender.com'
    }
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/test" -Method GET -Headers $headers
    Write-Host "✅ CORS Test: Success" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ CORS test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🔍 Testing Request OTP..." -ForegroundColor Yellow
try {
    $headers = @{
        'Content-Type' = 'application/json'
        'Origin' = 'https://uparkdeploy.onrender.com'
    }
    $body = @{
        name = "Test User"
        phone = "+919999999999"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/auth/request-otp" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Request OTP: Success" -ForegroundColor Green
    Write-Host "   Response: $($response.success)" -ForegroundColor Green
} catch {
    Write-Host "❌ Request OTP failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Test completed!" -ForegroundColor Green