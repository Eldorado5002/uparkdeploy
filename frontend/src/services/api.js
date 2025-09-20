// src/services/api.js
const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export async function requestOtp({ name, phone }) {
  try {
    console.log('Making request to:', `${API_BASE}/api/auth/request-otp`);
    const res = await fetch(`${API_BASE}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    
    console.log('Response status:', res.status);
    console.log('Response headers:', res.headers);
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Error response text:', text);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    const data = await res.json();
    return data; // { success, expiresAt, devCode? }
  } catch (error) {
    console.error('Request OTP error:', error);
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

export async function checkPhone({ phone }) {
  const res = await fetch(`${API_BASE}/api/auth/check-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check phone');
  return data; // { exists, user?, token? }
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
