import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp, checkPhone, updateVehicles } from '../services/api';
import './login.css';

export default function Signup() {
  // Steps: phone -> (exists? otp) : name -> otp -> vehicles -> dashboard
  const [step, setStep] = useState('phone'); // phone | name | otp | vehicles
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [devCode, setDevCode] = useState('');
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([{ type: '4W', numberPlate: '' }]);

  // Step 1: Enter phone; if exists, send OTP; else ask for name then send OTP
  const handleCheckPhone = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const phoneTrim = phone.trim();
      const res = await checkPhone({ phone: phoneTrim });
      if (res.exists) {
        // Existing user: request real OTP directly
        const req = await requestOtp({ name: res.user?.name || '', phone: phoneTrim });
        // Do not show dev OTP unless backend is in dev mode
        if (req.devCode) setDevCode(req.devCode);
        setStep('otp');
        setMessage('OTP sent. Please check your phone.');
      } else {
        setStep('name');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const nameTrim = name.trim();
      const phoneTrim = phone.trim();
      const res = await requestOtp({ name: nameTrim, phone: phoneTrim });
      if (res.devCode) setDevCode(res.devCode);
      setStep('otp');
      setMessage('OTP sent. Please check your phone.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const phoneTrim = phone.trim();
      const codeDigits = (code || '').toString().replace(/\D/g, '');
      const res = await verifyOtp({ phone: phoneTrim, code: codeDigits });
      // Persist a simple session token and user in localStorage
      localStorage.setItem('upark_token', res.token);
      localStorage.setItem('upark_user', JSON.stringify(res.user));
  // Mark time of auth for potential guards
  localStorage.setItem('upark_authed_at', String(Date.now()));
      // Proceed to collect vehicles for first-time user
      setStep('vehicles');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVehiclesSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const phoneTrim = phone.trim();
      const normalized = vehicles
        .map(v => ({ type: v.type === '2W' ? '2W' : '4W', numberPlate: (v.numberPlate || '').trim() }))
        .filter(v => v.numberPlate);
      if (normalized.length === 0) {
        setMessage('Please add at least one vehicle with a number plate.');
        setLoading(false);
        return;
      }
      const res = await updateVehicles({ phone: phoneTrim, vehicles: normalized });
      localStorage.setItem('upark_user', JSON.stringify(res.user));
      // Go to dashboard finally
      navigate('/', { replace: true });
      setTimeout(() => {
        if (window.location.pathname !== '/') window.location.replace('/');
      }, 200);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {step === 'phone' && (
        <form onSubmit={handleCheckPhone} className="auth-form">
          <h2>Welcome</h2>
          <input
            type="tel"
            placeholder="Phone number (E.164, e.g. +91XXXXXXXXXX)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <small style={{marginBottom: 8, display: 'block'}}>Enter your phone number in E.164 format. Example: +91XXXXXXXXXX</small>
          <button type="submit" disabled={loading}>{loading ? 'Checking…' : 'Continue'}</button>
          {message && <p className="auth-message">{message}</p>}
        </form>
      )}

      {step === 'name' && (
        <form onSubmit={handleRequestOtp} className="auth-form">
          <h2>Complete Signup</h2>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="tel"
            placeholder="Phone number (E.164, e.g. +91XXXXXXXXXX)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            disabled
          />
          <button type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send OTP'}</button>
          {message && <p className="auth-message">{message}</p>}
          {devCode && (
            <p className="auth-message dev">Dev OTP: {devCode}</p>
          )}
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="auth-form">
          <h2>Enter OTP</h2>
          <input
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify'}</button>
          {message && <p className="auth-message">{message}</p>}
          {devCode && (
            <p className="auth-message dev">Dev OTP: {devCode}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" disabled={loading} onClick={() => setStep('name')}>Change details</button>
            <button
              type="button"
              disabled={loading}
              onClick={() => (window.location.href = '/')}
              title="Go to dashboard"
            >
              Go to Dashboard
            </button>
          </div>
        </form>
      )}

      {step === 'vehicles' && (
        <form onSubmit={handleVehiclesSubmit} className="auth-form">
          <h2>Your Vehicles</h2>
          {vehicles.map((v, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8 }}>
              <select value={v.type} onChange={(e) => {
                const next = [...vehicles];
                next[idx] = { ...next[idx], type: e.target.value };
                setVehicles(next);
              }}>
                <option value="2W">2 Wheeler</option>
                <option value="4W">4 Wheeler</option>
              </select>
              <input
                type="text"
                placeholder="Number plate"
                value={v.numberPlate}
                onChange={(e) => {
                  const next = [...vehicles];
                  next[idx] = { ...next[idx], numberPlate: e.target.value };
                  setVehicles(next);
                }}
                required
              />
              {vehicles.length > 1 && (
                <button type="button" onClick={() => setVehicles(vehicles.filter((_, i) => i !== idx))}>Remove</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setVehicles([...vehicles, { type: '4W', numberPlate: '' }])}>+ Add vehicle</button>
          <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save & Continue'}</button>
          {message && <p className="auth-message">{message}</p>}
        </form>
      )}
    </div>
  );
}
