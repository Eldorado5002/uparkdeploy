// src/services/socketService.js
import { io } from 'socket.io-client';

// Connect to the server (adjust URL based on your deployment)
const SOCKET_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const socket = io(SOCKET_URL);

// Socket connection events
socket.on('connect', () => {
  console.log('Connected to socket server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from socket server');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

// API for sending commands to the ESP32
const socketService = {
  // Subscribe to real-time updates
  subscribeToSlotUpdates: (callback) => {
    socket.on('slot_update', callback);
    return () => socket.off('slot_update', callback);
  },
  
  // Legacy single gate status
  subscribeToGateUpdates: (callback) => {
    socket.on('gate_update', callback);
    return () => socket.off('gate_update', callback);
  },
  // New: entry/exit gate statuses
  subscribeToEntryGateUpdates: (callback) => {
    socket.on('entry_gate_update', callback);
    return () => socket.off('entry_gate_update', callback);
  },
  subscribeToExitGateUpdates: (callback) => {
    socket.on('exit_gate_update', callback);
    return () => socket.off('exit_gate_update', callback);
  },
  
  subscribeToDeviceStatus: (callback) => {
    socket.on('device_status', callback);
    return () => socket.off('device_status', callback);
  },
  
  // Subscribe to database slot updates (when hardware data updates the database)
  subscribeToDatabaseSlotUpdates: (callback) => {
    socket.on('database_slot_update', callback);
    return () => socket.off('database_slot_update', callback);
  },
  
  // Control functions
  openGate: () => {
    socket.emit('control_gate', 'OPEN');
  },
  
  closeGate: () => {
    socket.emit('control_gate', 'CLOSE');
  },
  // New granular gate controls
  openEntryGate: () => socket.emit('control_entry_gate', 'OPEN'),
  closeEntryGate: () => socket.emit('control_entry_gate', 'CLOSE'),
  openExitGate: () => socket.emit('control_exit_gate', 'OPEN'),
  closeExitGate: () => socket.emit('control_exit_gate', 'CLOSE'),

  // Admin override: set slot state
  adminOverrideSlot: ({ slotNumber, state }) => {
    socket.emit('admin_override_slot', { slotNumber, state });
  },
  
  // Simulation functions (for testing without actual vehicle detection)
  simulateVehicleDetected: () => {
    socket.emit('simulate_vehicle', 'DETECTED');
  },
  
  simulateVehicleAway: () => {
    socket.emit('simulate_vehicle', 'NONE');
  }
};

export default socketService;