// src/services/api.js
const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';

export async function requestOtp({ name, phone }) {
  const res = await fetch(`${API_BASE}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to request OTP');
  return data; // { success, expiresAt, devCode? }
}

export async function verifyOtp({ phone, code }) {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to verify OTP');
  return data; // { success, user, token }
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
