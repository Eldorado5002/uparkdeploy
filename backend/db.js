const { Pool } = require('pg');

const DEFAULT_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_z1xAysflnL8o@ep-gentle-hall-a1682jlk-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: DEFAULT_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function initSchema() {
  // Create tables if not exist
  await query(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    number_plate TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('2W','4W')),
    owner_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS parking_slots (
    slot_number INTEGER PRIMARY KEY,
    is_occupied BOOLEAN NOT NULL DEFAULT FALSE,
    is_reserved BOOLEAN NOT NULL DEFAULT FALSE,
    reserved_by TEXT REFERENCES users(phone) ON DELETE SET NULL,
    vehicle_number_plate TEXT REFERENCES vehicles(number_plate) ON DELETE SET NULL,
    location TEXT,
    slot_type TEXT NOT NULL DEFAULT 'BOTH' CHECK (slot_type IN ('2W','4W','BOTH')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id BIGSERIAL PRIMARY KEY,
    slot_number INTEGER NOT NULL REFERENCES parking_slots(slot_number) ON DELETE CASCADE,
    user_phone TEXT NOT NULL REFERENCES users(phone) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    vehicle_number_plate TEXT NOT NULL REFERENCES vehicles(number_plate) ON DELETE RESTRICT,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('2W','4W')),
    booking_start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    booking_duration INTEGER NOT NULL,
    booking_end_time TIMESTAMPTZ NOT NULL,
    duration_type TEXT NOT NULL CHECK (duration_type IN ('HOURLY','DAILY')),
    total_amount NUMERIC NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CANCELLED','EXPIRED')),
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    is_extended BOOLEAN DEFAULT FALSE,
    extension_hours INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS user_booking_profiles (
    user_phone TEXT PRIMARY KEY REFERENCES users(phone) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    total_reservations INTEGER NOT NULL DEFAULT 0,
    active_reservations INTEGER NOT NULL DEFAULT 0,
    total_amount_spent NUMERIC NOT NULL DEFAULT 0,
    preferred_vehicle_type TEXT CHECK (preferred_vehicle_type IN ('2W','4W')),
    preferred_duration TEXT CHECK (preferred_duration IN ('HOURLY','DAILY')),
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    membership_level TEXT NOT NULL DEFAULT 'BRONZE' CHECK (membership_level IN ('BRONZE','SILVER','GOLD','PLATINUM')),
    last_reservation_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS otps (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  `);
}

module.exports = { pool, query, initSchema };
