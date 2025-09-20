#!/bin/bash
# Deployment Test Script for UPark Backend

echo "🧪 Testing UPark Backend Deployment"
echo "=================================="

BACKEND_URL="https://uparkdeployback.onrender.com"

echo "🔍 Testing Health Check..."
curl -X GET "$BACKEND_URL/api/health" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" || echo "❌ Health check failed"

echo -e "\n🔍 Testing CORS..."
curl -X GET "$BACKEND_URL/api/test" \
  -H "Content-Type: application/json" \
  -H "Origin: https://uparkdeploy.onrender.com" \
  -w "\nStatus: %{http_code}\n" || echo "❌ CORS test failed"

echo -e "\n🔍 Testing Request OTP..."
curl -X POST "$BACKEND_URL/api/auth/request-otp" \
  -H "Content-Type: application/json" \
  -H "Origin: https://uparkdeploy.onrender.com" \
  -d '{"name": "Test User", "phone": "+919999999999"}' \
  -w "\nStatus: %{http_code}\n" || echo "❌ Request OTP failed"

echo -e "\n✅ Test completed!"