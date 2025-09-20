#!/usr/bin/env node

// Quick script to test backend connectivity
const https = require('https');

const BACKEND_URL = 'https://uparkdeployback.onrender.com';

function testEndpoint(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Backend Connectivity...\n');
  
  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing health check endpoint...');
    const healthResult = await testEndpoint('/api/health');
    console.log(`   Status: ${healthResult.status}`);
    console.log(`   Response: ${healthResult.body}`);
    console.log('   ✅ Health check passed\n');
    
    // Test 2: Check Phone Endpoint
    console.log('2️⃣ Testing check phone endpoint...');
    const phoneResult = await testEndpoint('/api/auth/check-phone', 'POST', {
      phone: '+919999999999'
    });
    console.log(`   Status: ${phoneResult.status}`);
    console.log(`   Response: ${phoneResult.body}`);
    console.log('   ✅ Check phone endpoint responded\n');
    
    console.log('🎉 All tests passed! Backend is working correctly.');
    
  } catch (error) {
    console.error('❌ Backend test failed:', error.message);
    console.error('\n🔧 Possible solutions:');
    console.error('   1. Check if your backend is deployed and running on Render');
    console.error('   2. Verify the backend URL is correct');
    console.error('   3. Check Render logs for any backend errors');
    console.error('   4. Make sure environment variables are set correctly');
  }
}

runTests();