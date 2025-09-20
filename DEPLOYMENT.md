# Deployment Guide for Render

## Backend Deployment (Node.js)

1. **Environment Variables on Render:**
   Set these in your Render backend service dashboard:
   ```
   NODE_ENV=production
   PORT=10000
   POSTGRES_URL=your_postgres_connection_string
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   TWILIO_PHONE_NUMBER=your_twilio_phone
   ```

2. **Build Command:** (leave empty)
3. **Start Command:** `npm start`

## Frontend Deployment (Static Site)

1. **Build Command:** `npm run build`
2. **Publish Directory:** `build`
3. **Environment Variables:**
   ```
   REACT_APP_BACKEND_URL=https://your-backend-service.onrender.com
   NODE_ENV=production
   ```

## Common Issues & Solutions

### "Unexpected token '<'" Error
- This happens when frontend tries to call API but gets HTML instead of JSON
- Usually means the backend URL is wrong or backend is not responding
- Check if your backend service is running on Render
- Test backend directly: `https://your-backend.onrender.com/api/health`

### CORS Issues
- Backend already has CORS configured for all origins
- If still having issues, check Render logs

### Testing
- Backend test page: `https://your-backend.onrender.com/test.html`
- Check Render logs for both services

## Deployment Checklist

- [ ] Backend deployed with correct environment variables
- [ ] Backend health check works: `/api/health`
- [ ] Frontend built with correct `REACT_APP_BACKEND_URL`
- [ ] Frontend deployed to static site service
- [ ] Test the phone number input on frontend