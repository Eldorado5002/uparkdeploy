const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const { query, initSchema, testConnection } = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // You can restrict this to your frontend domain in production
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json()); // For parsing JSON requests if needed

// MQTT Setup
const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const TOPIC_PREFIX = 'parking_system_custom_123456/';

const TOPIC_PUB_SLOT = `${TOPIC_PREFIX}slot_status`;
const TOPIC_PUB_GATE_STATUS = `${TOPIC_PREFIX}gate_status`;
const TOPIC_SUB_VEHICLE = `${TOPIC_PREFIX}vehicle_status`;
const TOPIC_SUB_GATE = `${TOPIC_PREFIX}gate_control`; // legacy (entry gate)
// New granular gate control topics
const TOPIC_SUB_ENTRY_GATE = `${TOPIC_PREFIX}entry_gate_control`;
const TOPIC_SUB_EXIT_GATE = `${TOPIC_PREFIX}exit_gate_control`;
const TOPIC_DEVICE_STATUS = `${TOPIC_PREFIX}device_status`;
const TOPIC_SUB_RESERVATION_STATUS = `${TOPIC_PREFIX}reservation_status`; // New topic to send reservation data to ESP32
// Admin overrides
const TOPIC_SUB_ADMIN_SLOT_OVERRIDE = `${TOPIC_PREFIX}admin_slot_override`;

const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  mqttClient.subscribe([TOPIC_PUB_SLOT, TOPIC_PUB_GATE_STATUS, TOPIC_DEVICE_STATUS]);
});

mqttClient.on('message', async (topic, message) => {
  const msg = message.toString();
  console.log(`MQTT: ${topic} → ${msg}`);

  if (topic === TOPIC_PUB_SLOT) {
    // Update database with real-time slot data from ESP32
    io.emit('slot_update', msg);
    // Also trigger database update asynchronously
    updateSlotsFromHardware(msg).catch(err => 
      console.error('Error updating slots from hardware:', err)
    );
  }
  else if (topic === TOPIC_PUB_GATE_STATUS) {
    // Support both legacy single status (OPEN/CLOSED) and new labeled statuses (ENTRY:OPEN, EXIT:CLOSED)
    if (/^ENTRY:/.test(msg)) {
      const status = msg.split(':')[1] || msg;
      io.emit('entry_gate_update', status);
      // Back-compat for UI that expects single gate_update (treat as entry)
      io.emit('gate_update', status);
    } else if (/^EXIT:/.test(msg)) {
      const status = msg.split(':')[1] || msg;
      io.emit('exit_gate_update', status);
    } else {
      io.emit('gate_update', msg);
    }
  }
  else if (topic === TOPIC_DEVICE_STATUS) {
    io.emit('device_status', msg);
    // When ESP32 comes online, send current reservation status
    if (msg === 'ONLINE') {
      console.log('ESP32 came online, syncing reservation status...');
      publishReservationStatusToESP32().catch(err => 
        console.error('Error syncing reservation status to ESP32:', err)
      );
    }
  }
});

// Socket.IO communication
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('control_gate', (action) => {
    console.log(`🚪 Gate control: ${action}`);
    mqttClient.publish(TOPIC_SUB_GATE, action);
  });

  // New: granular entry/exit gate control
  socket.on('control_entry_gate', (action) => {
    console.log(`🚪 Entry gate control: ${action}`);
    mqttClient.publish(TOPIC_SUB_ENTRY_GATE, String(action || '').toUpperCase());
  });

  socket.on('control_exit_gate', (action) => {
    console.log(`🚪 Exit gate control: ${action}`);
    mqttClient.publish(TOPIC_SUB_EXIT_GATE, String(action || '').toUpperCase());
  });

  // Admin: override slot state (AVAILABLE | RESERVED | OCCUPIED)
  socket.on('admin_override_slot', async ({ slotNumber, state }) => {
    try {
      const sn = Number(slotNumber);
      const desired = String(state || '').toUpperCase();
      if (!sn || !['AVAILABLE','RESERVED','OCCUPIED'].includes(desired)) return;

      console.log(`🛠️ Admin override slot ${sn} -> ${desired}`);

      // Update DB to keep UI and persistence consistent
      let updated;
      if (desired === 'AVAILABLE') {
        const { rows } = await query(
          `UPDATE parking_slots 
           SET is_occupied=false, is_reserved=false, reserved_by=NULL, vehicle_number_plate=NULL, updated_at=NOW()
           WHERE slot_number=$1
           RETURNING slot_number AS "slotNumber", is_occupied AS "isOccupied", is_reserved AS "isReserved", reserved_by AS "reservedBy", vehicle_number_plate AS "vehicleNumberPlate"`,
          [sn]
        );
        updated = rows[0];
      } else if (desired === 'RESERVED') {
        const { rows } = await query(
          `UPDATE parking_slots 
           SET is_occupied=false, is_reserved=true, updated_at=NOW()
           WHERE slot_number=$1
           RETURNING slot_number AS "slotNumber", is_occupied AS "isOccupied", is_reserved AS "isReserved", reserved_by AS "reservedBy", vehicle_number_plate AS "vehicleNumberPlate"`,
          [sn]
        );
        updated = rows[0];
      } else if (desired === 'OCCUPIED') {
        const { rows } = await query(
          `UPDATE parking_slots 
           SET is_occupied=true, is_reserved=false, updated_at=NOW()
           WHERE slot_number=$1
           RETURNING slot_number AS "slotNumber", is_occupied AS "isOccupied", is_reserved AS "isReserved", reserved_by AS "reservedBy", vehicle_number_plate AS "vehicleNumberPlate"`,
          [sn]
        );
        updated = rows[0];
      }

      if (updated) {
        io.emit('database_slot_update', updated);
      }

      // Inform hardware to reflect override on OLED and local logic
      const payload = `SET:${sn}:${desired}`; // e.g., SET:3:RESERVED
      mqttClient.publish(TOPIC_SUB_ADMIN_SLOT_OVERRIDE, payload);

      // If reservation state changed, sync reservation list to ESP32
      if (desired === 'RESERVED' || desired === 'AVAILABLE') {
        await publishReservationStatusToESP32();
      }
    } catch (err) {
      console.error('Error handling admin_override_slot:', err);
    }
  });

  socket.on('simulate_vehicle', (status) => {
    console.log(`🚗 Vehicle simulation: ${status}`);
    mqttClient.publish(TOPIC_SUB_VEHICLE, status);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// PostgreSQL connection/init
(async () => {
  try {
    await initSchema();
    console.log('✅ PostgreSQL schema ensured');
    // Initialize slots if needed
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM parking_slots');
    const count = rows[0].c;
    if (count === 0) {
      console.log('🚗 Initializing parking slots...');
      for (let i = 1; i <= 6; i++) {
        await query(
          'INSERT INTO parking_slots (slot_number, is_occupied, is_reserved, location, slot_type) VALUES ($1,false,false,$2,\'BOTH\')',
          [i, `A${i}`]
        );
      }
      console.log('✅ 6 parking slots initialized');
    } else {
      console.log(`✅ ${count} parking slots already exist`);
    }

    setTimeout(() => {
      publishReservationStatusToESP32().catch((err) => console.error('Error sending initial reservation status to ESP32:', err));
    }, 2000);

    await publishReservationStatusToESP32();
  } catch (err) {
    console.error('PostgreSQL init error:', err);
  }
})();

// No mongoose models – using PostgreSQL via ./db

// Helpers
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Pricing helper function
const calculateParkingFee = (vehicleType, duration, durationType) => {
  const baseRates = {
    '2W': { hourly: 10, daily: 80 },  // 2-wheeler rates
    '4W': { hourly: 20, daily: 150 }  // 4-wheeler rates
  };
  
  const rates = baseRates[vehicleType];
  if (!rates) throw new Error('Invalid vehicle type');
  
  if (durationType === 'HOURLY') {
    return rates.hourly * duration;
  } else if (durationType === 'DAILY') {
    const days = Math.ceil(duration / 24);
    return rates.daily * days;
  } else {
    throw new Error('Invalid duration type');
  }
};

// Function to update database slots based on hardware sensor data
async function updateSlotsFromHardware(sensorData) {
  try {
    let availableSlots = [];
    
    if (sensorData === "FULL") {
      availableSlots = []; // No slots available
    } else {
      // Parse comma-separated list of available slots (e.g., "1,2,3")
      availableSlots = sensorData.split(",").map(Number).filter(num => !isNaN(num));
    }
    
    console.log(`Hardware update: Available slots from ESP32: [${availableSlots.join(',')}]`);
    
    // Get all slots from database
    const { rows: allSlots } = await query('SELECT slot_number, is_occupied, is_reserved FROM parking_slots ORDER BY slot_number');
    // Update each slot based on hardware data, but never override reserved
    for (const slot of allSlots) {
      const isAvailableFromHardware = availableSlots.includes(slot.slot_number);
      const shouldBeOccupied = !isAvailableFromHardware && !slot.is_reserved;
      if (slot.is_reserved) continue; // don't override reserved
      if (slot.is_occupied !== shouldBeOccupied) {
        await query(
          'UPDATE parking_slots SET is_occupied=$1, vehicle_number_plate = CASE WHEN $1 = false THEN NULL ELSE vehicle_number_plate END, updated_at=NOW() WHERE slot_number=$2',
          [shouldBeOccupied, slot.slot_number]
        );
        io.emit('database_slot_update', {
          slotNumber: slot.slot_number,
          isOccupied: shouldBeOccupied,
          isReserved: slot.is_reserved
        });
      }
    }
  } catch (error) {
    console.error('Error updating slots from hardware:', error);
  }
}

// Function to publish current slot reservation status to ESP32
async function publishReservationStatusToESP32() {
  try {
    const { rows } = await query('SELECT slot_number, is_reserved FROM parking_slots ORDER BY slot_number');
    const reservedSlots = rows.filter(r => r.is_reserved).map(r => r.slot_number);
    
    const reservationMessage = reservedSlots.length > 0 
      ? `R:${reservedSlots.join(',')}` 
      : 'R:NONE';
    
    console.log(`Publishing reservation status to ESP32: ${reservationMessage}`);
    
    // Publish to MQTT topic that ESP32 subscribes to
    mqttClient.publish(TOPIC_SUB_RESERVATION_STATUS, reservationMessage);
    
  } catch (error) {
    console.error('Error publishing reservation status to ESP32:', error);
  }
}

// Optional: Twilio SMS
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const Twilio = require('twilio');
    twilioClient = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  } catch (e) {
    console.warn('Twilio not configured, falling back to console OTP');
  }
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const dbTest = await query('SELECT NOW() as current_time');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      message: 'Backend server is running',
      database: {
        connected: true,
        server_time: dbTest.rows[0].current_time
      },
      config: {
        port: process.env.PORT || 5000,
        has_postgres_url: !!process.env.POSTGRES_URL,
        has_database_url: !!process.env.DATABASE_URL,
        has_twilio_config: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      message: 'Health check failed',
      error: error.message,
      database: {
        connected: false
      }
    });
  }
});

// API routes for OTP signup
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    // Normalize phone - simple trim (UI should provide E.164 like +91xxxxxxxxxx)
    const phoneNorm = String(phone).trim();

    // Determine if user already exists
    const { rows: existingUserRows } = await query('SELECT phone, name FROM users WHERE phone=$1', [phoneNorm]);
    const userExists = existingUserRows.length > 0;
    const effectiveName = userExists ? (name ? String(name).trim() : existingUserRows[0].name) : String(name || '').trim();

    if (!userExists && !effectiveName) {
      return res.status(400).json({ error: 'name is required for new users' });
    }

    const code = generateOtp();
    const ttlMinutes = 5;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    // Upsert OTP
    await query(
      `INSERT INTO otps (phone, code, expires_at, attempts)
       VALUES ($1,$2,$3,0)
       ON CONFLICT (phone) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at, attempts=0, updated_at=NOW()`,
      [phoneNorm, code, expiresAt]
    );

    // Ensure user row exists (create or update name)
    if (userExists) {
      if (name && effectiveName !== existingUserRows[0].name) {
        await query('UPDATE users SET name=$2, updated_at=NOW() WHERE phone=$1', [phoneNorm, effectiveName]);
      }
    } else {
      await query(
        `INSERT INTO users (phone, name) VALUES ($1,$2)
         ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()`,
        [phoneNorm, effectiveName]
      );
    }

    if (twilioClient && process.env.TWILIO_FROM_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: `Your uPark verification code is ${code}`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: phoneNorm,
        });
      } catch (smsErr) {
        console.warn('Twilio send failed, showing OTP in response for dev');
        return res.json({ success: true, devCode: code, expiresAt });
      }
      return res.json({ success: true, expiresAt });
    }

    // Dev mode: return code in response if SMS not configured
    console.log(`[DEV OTP] ${phoneNorm} -> ${code}`);
    return res.json({ success: true, devCode: code, expiresAt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });
    const phoneNorm = String(phone).trim();
    const { rows: otpRows } = await query('SELECT phone, code, expires_at, attempts FROM otps WHERE phone=$1', [phoneNorm]);
    if (otpRows.length === 0) return res.status(400).json({ error: 'OTP not found. Request again.' });
    const otpDoc = otpRows[0];
    if (new Date(otpDoc.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired. Request again.' });
    if (otpDoc.attempts >= 5) return res.status(429).json({ error: 'Too many attempts. Request a new OTP.' });
    if (otpDoc.code !== String(code)) {
      await query('UPDATE otps SET attempts = attempts + 1, updated_at=NOW() WHERE phone=$1', [phoneNorm]);
      return res.status(400).json({ error: 'Invalid code' });
    }
    await query('DELETE FROM otps WHERE phone=$1', [phoneNorm]);

    const { rows: userRows } = await query('SELECT phone, name FROM users WHERE phone=$1', [phoneNorm]);
    const user = userRows[0] || { phone: phoneNorm, name: '' };
    const { rows: vehRows } = await query('SELECT number_plate, type FROM vehicles WHERE owner_phone=$1', [phoneNorm]);
    const vehicles = vehRows.map(v => ({ numberPlate: v.number_plate, type: v.type }));
    const session = Buffer.from(`${phoneNorm}:${Date.now()}`).toString('base64');
    return res.json({ success: true, user: { name: user?.name || '', phone: phoneNorm, vehicles }, token: session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Check if phone exists; if yes, return user and a session token to skip OTP
app.post('/api/auth/check-phone', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    const phoneNorm = String(phone).trim();
    const { rows: userRows } = await query('SELECT phone, name FROM users WHERE phone=$1', [phoneNorm]);
    if (userRows.length === 0) return res.json({ exists: false });
    const user = userRows[0];
    const { rows: vehRows } = await query('SELECT number_plate, type FROM vehicles WHERE owner_phone=$1', [phoneNorm]);
    const vehicles = vehRows.map(v => ({ numberPlate: v.number_plate, type: v.type }));
    const session = Buffer.from(`${phoneNorm}:${Date.now()}`).toString('base64');
    return res.json({ exists: true, user: { name: user.name, phone: user.phone, vehicles }, token: session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Update vehicles for a user
app.post('/api/users/update-vehicles', async (req, res) => {
  try {
    const { phone, vehicles: vehiclesInput } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    if (!Array.isArray(vehiclesInput) || vehiclesInput.length === 0) {
      return res.status(400).json({ error: 'vehicles must be a non-empty array' });
    }
    const phoneNorm = String(phone).trim();
    // Basic validation on each vehicle
    const normalized = vehiclesInput.map((v) => ({
      type: v.type === '4W' ? '4W' : '2W',
      numberPlate: String(v.numberPlate || '').trim(),
    })).filter(v => v.numberPlate);
    if (normalized.length === 0) return res.status(400).json({ error: 'valid vehicles required' });

    // Upsert each vehicle into vehicles table with number_plate as PK
    const keepSet = new Set();
    for (const v of normalized) {
      await query(
        `INSERT INTO vehicles (number_plate, type, owner_phone) VALUES ($1,$2,$3)
         ON CONFLICT (number_plate) DO UPDATE SET type=EXCLUDED.type, owner_phone=EXCLUDED.owner_phone, updated_at=NOW()`,
        [v.numberPlate, v.type, phoneNorm]
      );
      keepSet.add(v.numberPlate);
    }
    // Remove any vehicles previously owned by this phone that were not submitted this time
    const keepList = Array.from(keepSet);
    if (keepList.length > 0) {
      await query(
        `DELETE FROM vehicles WHERE owner_phone=$1 AND number_plate <> ALL($2)`,
        [phoneNorm, keepList]
      );
    } else {
      await query(`DELETE FROM vehicles WHERE owner_phone=$1`, [phoneNorm]);
    }

    // Build response user
    const { rows: urows } = await query('SELECT phone, name FROM users WHERE phone=$1', [phoneNorm]);
    if (urows.length === 0) return res.status(404).json({ error: 'user not found' });
    const { rows: vrows } = await query('SELECT number_plate, type FROM vehicles WHERE owner_phone=$1', [phoneNorm]);
    const vehicles = vrows.map(v => ({ numberPlate: v.number_plate, type: v.type }));
    const user = urows[0];
    return res.json({ success: true, user: { name: user.name, phone: user.phone, vehicles } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Initialize parking slots (run once to set up default slots)
app.post('/api/admin/init-slots', async (req, res) => {
  try {
    const { totalSlots = 6 } = req.body;
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM parking_slots');
    if (rows[0].c > 0) {
      return res.json({ success: true, message: 'Slots already initialized', count: rows[0].c });
    }
    for (let i = 1; i <= totalSlots; i++) {
      await query('INSERT INTO parking_slots (slot_number, is_occupied, is_reserved, location, slot_type) VALUES ($1,false,false,$2,\'BOTH\')', [i, `A${i}`]);
    }
    res.json({ success: true, message: 'Slots initialized', count: totalSlots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get all parking slots with their status
app.get('/api/slots', async (req, res) => {
  try {
    const { rows } = await query('SELECT slot_number AS "slotNumber", is_occupied AS "isOccupied", is_reserved AS "isReserved", reserved_by AS "reservedBy", vehicle_number_plate AS "vehicleNumberPlate", location, slot_type AS "slotType" FROM parking_slots ORDER BY slot_number');
    res.json({ success: true, slots: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Reserve a parking slot
app.post('/api/reservations/create', async (req, res) => {
  try {
    const { phone, slotNumber, vehicleNumberPlate, vehicleType, duration, durationType, bookingStartTime } = req.body;
    
    if (!phone || !slotNumber || !vehicleNumberPlate || !vehicleType || !duration || !durationType) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate duration
    if (duration <= 0 || duration > 24 * 7) { // max 7 days
      return res.status(400).json({ error: 'Invalid duration. Must be between 1 hour and 7 days.' });
    }

    // Check if slot is available
    const { rows: slotRows } = await query('SELECT slot_number, is_occupied, is_reserved FROM parking_slots WHERE slot_number=$1', [slotNumber]);
    const slot = slotRows[0];
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }
    
    if (slot.is_occupied || slot.is_reserved) {
      return res.status(400).json({ error: 'Slot is not available' });
    }

    // Check if user owns the vehicle
    const { rows: vehRows } = await query('SELECT number_plate, type FROM vehicles WHERE number_plate=$1 AND owner_phone=$2', [vehicleNumberPlate, phone]);
    if (vehRows.length === 0) {
      return res.status(400).json({ error: 'Vehicle not found or not owned by user' });
    }

    // Get user info
    const { rows: userRows } = await query('SELECT phone, name FROM users WHERE phone=$1', [phone]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRows[0];

    // Check if user already has an active reservation
    const { rows: existingRows } = await query(
      `SELECT id FROM reservations WHERE user_phone=$1 AND status='ACTIVE' AND payment_status IN ('PENDING','COMPLETED') LIMIT 1`,
      [phone]
    );
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'You already have an active reservation' });
    }

    // Calculate pricing
    const totalAmount = calculateParkingFee(vehicleType, duration, durationType);
    
    // Set booking times
    const startTime = bookingStartTime ? new Date(bookingStartTime) : new Date();
    const endTime = new Date(startTime.getTime() + (duration * 60 * 60 * 1000)); // duration in hours

    // Create reservation
    const { rows: resRows } = await query(
      `INSERT INTO reservations (slot_number, user_phone, user_name, vehicle_number_plate, vehicle_type, booking_start_time, booking_duration, booking_end_time, duration_type, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, slot_number, booking_duration, duration_type, booking_start_time, booking_end_time, total_amount, status`,
      [slotNumber, phone, user.name, vehicleNumberPlate, vehicleType, startTime, duration, endTime, durationType, totalAmount]
    );
    const reservation = resRows[0];

    // Mark slot as reserved
    await query('UPDATE parking_slots SET is_reserved=true, reserved_by=$1, vehicle_number_plate=$2, updated_at=NOW() WHERE slot_number=$3', [phone, vehicleNumberPlate, slotNumber]);

    // Notify all clients that a slot has been reserved
    io.emit('database_slot_update', { 
      slotNumber: slotNumber, 
      isOccupied: false, 
      isReserved: true,
      reservedBy: phone,
      vehicleNumberPlate: vehicleNumberPlate
    });
    
    console.log(`Slot ${slotNumber} reserved by user ${phone}, notified all clients`);

    // Publish updated reservation status to ESP32
    await publishReservationStatusToESP32();

    // Update or create user booking profile
    await query(
      `INSERT INTO user_booking_profiles (user_phone, user_name, total_reservations, active_reservations, last_reservation_date, preferred_vehicle_type, preferred_duration)
       VALUES ($1,$2,1,1,$3,$4,$5)
       ON CONFLICT (user_phone) DO UPDATE SET 
         user_name=EXCLUDED.user_name,
         total_reservations=user_booking_profiles.total_reservations+1,
         active_reservations=user_booking_profiles.active_reservations+1,
         last_reservation_date=EXCLUDED.last_reservation_date,
         preferred_vehicle_type=EXCLUDED.preferred_vehicle_type,
         preferred_duration=EXCLUDED.preferred_duration,
         updated_at=NOW()`,
      [phone, user.name, new Date(), vehicleType, durationType]
    );

    res.json({ 
      success: true, 
      reservation: {
        id: reservation.id,
        slotNumber: reservation.slot_number,
        duration: reservation.booking_duration,
        durationType: reservation.duration_type,
        bookingStartTime: reservation.booking_start_time,
        bookingEndTime: reservation.booking_end_time,
        totalAmount: reservation.total_amount,
        status: reservation.status
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Process payment for reservation
app.post('/api/reservations/payment', async (req, res) => {
  try {
    const { reservationId, paymentMethod = 'MOCK' } = req.body;
    
    if (!reservationId) {
      return res.status(400).json({ error: 'Reservation ID is required' });
    }

    const { rows } = await query('SELECT * FROM reservations WHERE id=$1', [reservationId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const reservation = rows[0];

    if (reservation.payment_status === 'COMPLETED') {
      return res.status(400).json({ error: 'Payment already completed' });
    }

    // Mock payment processing (replace with actual payment gateway)
    const paymentSuccess = Math.random() > 0.1; // 90% success rate for demo
    
    if (paymentSuccess) {
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await query('UPDATE reservations SET payment_status=\'COMPLETED\', payment_id=$2, updated_at=NOW() WHERE id=$1', [reservationId, paymentId]);

      res.json({ 
        success: true, 
        message: 'Payment successful',
        paymentId,
        reservation: {
          id: reservation.id,
          slotNumber: reservation.slot_number,
          vehicleNumberPlate: reservation.vehicle_number_plate
        }
      });
    } else {
      await query('UPDATE reservations SET payment_status=\'FAILED\', updated_at=NOW() WHERE id=$1', [reservationId]);

      // Release the slot
      await query('UPDATE parking_slots SET is_reserved=false, reserved_by=NULL, vehicle_number_plate=NULL, updated_at=NOW() WHERE slot_number=$1', [reservation.slot_number]);

      // Notify all clients that the slot is now available again
      io.emit('database_slot_update', { 
        slotNumber: reservation.slot_number, 
        isOccupied: false, 
        isReserved: false,
        reservedBy: null,
        vehicleNumberPlate: null
      });
      
      console.log(`Slot ${reservation.slotNumber} released due to payment failure, notified all clients`);

      // Publish updated reservation status to ESP32
      await publishReservationStatusToESP32();

      res.status(400).json({ error: 'Payment failed. Please try again.' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get user's reservations
app.get('/api/reservations/user/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { rows } = await query('SELECT * FROM reservations WHERE user_phone=$1 ORDER BY created_at DESC', [phone]);
    res.json({ success: true, reservations: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get user's booking profile
app.get('/api/users/booking-profile/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { rows } = await query('SELECT * FROM user_booking_profiles WHERE user_phone=$1', [phone]);
    if (rows.length === 0) {
      return res.json({ 
        success: true, 
        profile: {
          userPhone: phone,
          totalReservations: 0,
          activeReservations: 0,
          totalAmountSpent: 0,
          membershipLevel: 'BRONZE',
          reservationHistory: []
        }
      });
    }
    const p = rows[0];
    res.json({ success: true, profile: {
      userPhone: p.user_phone,
      userName: p.user_name,
      totalReservations: p.total_reservations,
      activeReservations: p.active_reservations,
      totalAmountSpent: Number(p.total_amount_spent || 0),
      membershipLevel: p.membership_level,
      reservationHistory: []
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Get pricing information
app.post('/api/reservations/calculate-price', async (req, res) => {
  try {
    const { vehicleType, duration, durationType } = req.body;
    
    if (!vehicleType || !duration || !durationType) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const totalAmount = calculateParkingFee(vehicleType, duration, durationType);
    
    res.json({ 
      success: true, 
      pricing: {
        vehicleType,
        duration,
        durationType,
        totalAmount,
        perHourRate: vehicleType === '2W' ? 10 : 20,
        perDayRate: vehicleType === '2W' ? 80 : 150
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Cancel a reservation
app.post('/api/reservations/cancel', async (req, res) => {
  try {
    const { reservationId, userPhone } = req.body;
    
    if (!reservationId || !userPhone) {
      return res.status(400).json({ error: 'Reservation ID and user phone are required' });
    }

    const { rows } = await query('SELECT * FROM reservations WHERE id=$1 AND user_phone=$2 AND status=\'ACTIVE\'', [reservationId, userPhone]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active reservation not found' });
    }
    const reservation = rows[0];

    // Update reservation status
    await query('UPDATE reservations SET status=\'CANCELLED\', payment_status=CASE WHEN payment_status=\'COMPLETED\' THEN \'REFUNDED\' ELSE \'FAILED\' END, updated_at=NOW() WHERE id=$1', [reservationId]);

    // Release the slot
    await query('UPDATE parking_slots SET is_reserved=false, reserved_by=NULL, vehicle_number_plate=NULL, updated_at=NOW() WHERE slot_number=$1', [reservation.slot_number]);

    // Notify all clients that the slot is now available
    io.emit('database_slot_update', { 
      slotNumber: reservation.slot_number, 
      isOccupied: false, 
      isReserved: false,
      reservedBy: null,
      vehicleNumberPlate: null
    });
    
    console.log(`Slot ${reservation.slotNumber} released due to cancellation, notified all clients`);

    // Publish updated reservation status to ESP32
    await publishReservationStatusToESP32();

    // Update user booking profile
    await query('UPDATE user_booking_profiles SET active_reservations = GREATEST(active_reservations - 1, 0), updated_at=NOW() WHERE user_phone=$1', [userPhone]);

    res.json({ success: true, message: 'Reservation cancelled successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Catch all handler: send back React's index.html file for any non-API routes
  app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
} else {
  // Development mode - just handle undefined API routes
  app.get('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });
}

// Start server
const PORT = process.env.PORT || 5000;

// Initialize server with database connection test
async function startServer() {
  try {
    console.log('🚀 Starting UPark Backend Server...');
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Server will not start.');
      process.exit(1);
    }
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🧪 Test page: http://localhost:${PORT}/test.html`);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
