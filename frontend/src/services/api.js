// src/services/api.js
const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

console.log('🔗 API_BASE configured as:', API_BASE);
console.log('🌍 Environment:', process.env.NODE_ENV);

// Helper function to handle fetch errors with better debugging
async function handleFetch(url, options = {}) {
  try {
    console.log('🚀 Making request to:', url);
    console.log('📤 Request options:', options);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    console.log('📥 Response status:', response.status);
    console.log('📥 Response ok:', response.ok);
    
    return response;
  } catch (error) {
    console.error('🚨 Fetch error:', error);
    console.error('🚨 Error type:', error.constructor.name);
    console.error('🚨 Error message:', error.message);
    
    // Provide more helpful error messages
    if (error.message.includes('Failed to fetch')) {
      throw new Error(`Cannot connect to backend server at ${API_BASE}. Please check if the backend is running and the URL is correct.`);
    }
    
    throw error;
  }
}

export async function requestOtp({ name, phone }) {
  try {
    const url = `${API_BASE}/api/auth/request-otp`;
    const res = await handleFetch(url, {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('❌ Request OTP error response:', text);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    const data = await res.json();
    console.log('✅ Request OTP success:', data);
    return data; // { success, expiresAt, devCode? }
  } catch (error) {
    console.error('❌ Request OTP error:', error);
    throw error;
  }
}

export async function verifyOtp({ phone, code }) {
  try {
    console.log('Making request to:', `${API_BASE}/api/auth/verify-otp`);
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Error response text:', text);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    const data = await res.json();
    return data; // { success, user, token }
  } catch (error) {
    console.error('Verify OTP error:', error);
    throw error;
  }
}

// Test function to verify backend connectivity
export async function testBackendConnection() {
  try {
    const url = `${API_BASE}/api/health`;
    console.log('🔍 Testing backend connection...');
    const res = await handleFetch(url, { method: 'GET' });
    
    if (!res.ok) {
      throw new Error(`Backend health check failed with status ${res.status}`);
    }
    
    const data = await res.json();
    console.log('✅ Backend connection successful:', data);
    return data;
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    throw error;
  }
}

export async function checkPhone({ phone }) {
  try {
    const url = `${API_BASE}/api/auth/check-phone`;
    const res = await handleFetch(url, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('❌ Check phone error response:', text);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    const data = await res.json();
    console.log('✅ Check phone success:', data);
    return data; // { exists, user?, token? }
  } catch (error) {
    console.error('❌ Check phone error:', error);
    throw error;
  }
}

export async function updateVehicles({ phone, vehicles }) {
  const res = await fetch(`${API_BASE}/api/users/update-vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, vehicles }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update vehicles');
  return data; // { success, user }
}
