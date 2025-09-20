# Backend (uPark)

This backend provides APIs for authentication via OTP, reservations, and real-time hardware integration using MQTT and Socket.IO. It uses PostgreSQL (Neon) via the `pg` driver.

## Prerequisites
- Node.js 18+
- A PostgreSQL URL (Neon recommended)
- Twilio account and phone number for sending real OTP SMS

## Environment setup
1. Copy `.env.example` to `.env` and fill in values:
```
PORT=5000
POSTGRES_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+91XXXXXXXXXX
```

2. Ensure your phone numbers are in E.164 format (e.g., `+91XXXXXXXXXX`). The UI uses the value you enter as-is.

## Install and run (Windows PowerShell)
```
# From backend folder
npm install
# Initialize DB schema
npm run migrate
# Start the server
npm start
```
The server runs on http://localhost:5000.

## OTP flow
- Request OTP: `POST /api/auth/request-otp` with JSON `{ name?, phone }`
  - If user exists, `name` is optional
  - If user does not exist, `name` is required
  - On success, an SMS is sent via Twilio. In dev mode without Twilio, `devCode` is returned in the response.
- Verify OTP: `POST /api/auth/verify-otp` with `{ phone, code }`
  - Returns `{ success, user, token }`

## Notes
- This backend also publishes reservation status and receives hardware slot/gate updates over MQTT.
- Ensure the frontend `proxy` is `http://localhost:5000` to call APIs during development.
