// src/pages/Index.jsx
import React, { useEffect, useState } from "react";
import "./style.css";
import { Link, useNavigate } from "react-router-dom";
import socketService from "../services/socketService";
import SlotReservation from "../components/SlotReservation";

export default function Index() {
  const navigate = useNavigate();
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('upark_user') || 'null'); } catch { return null; }
  })();

  const logout = () => {
    localStorage.removeItem('upark_token');
    localStorage.removeItem('upark_user');
    navigate('/signup');
  };
  const [availableSlots, setAvailableSlots] = useState(0);
  const [totalSlots] = useState(6);
  const [gateStatus, setGateStatus] = useState("CLOSED");
  const [entryGateStatus, setEntryGateStatus] = useState("CLOSED");
  const [exitGateStatus, setExitGateStatus] = useState("CLOSED");
  const [freeSlotsList, setFreeSlotsList] = useState([]);
  const [isSystemOnline, setIsSystemOnline] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(true);
  const [activeTab, setActiveTab] = useState('monitor');
  const [realtimeSlots, setRealtimeSlots] = useState([]);

  useEffect(() => {
    console.log("Index page loaded");
    
    // Initialize slots by fetching from database
    const initializeSlots = async () => {
      try {
        console.log('Fetching initial slots from database...');
        const response = await fetch('/api/slots');
        const data = await response.json();
        if (data.success && data.slots) {
          setRealtimeSlots(data.slots);
          console.log('Initialized slots from database:', data.slots);
        } else {
          // Fallback to default initialization
          const initialSlots = [];
          for (let i = 1; i <= totalSlots; i++) {
            initialSlots.push({
              slotNumber: i,
              isOccupied: false,
              isReserved: false,
              location: `A${i}`,
              slotType: 'BOTH'
            });
          }
          setRealtimeSlots(initialSlots);
        }
      } catch (error) {
        console.error('Error fetching initial slots:', error);
        // Fallback to default initialization
        const initialSlots = [];
        for (let i = 1; i <= totalSlots; i++) {
          initialSlots.push({
            slotNumber: i,
            isOccupied: false,
            isReserved: false,
            location: `A${i}`,
            slotType: 'BOTH'
          });
        }
        setRealtimeSlots(initialSlots);
      }
    };
    
    initializeSlots();
    
    // Subscribe to real-time updates from the ESP32
    const unsubscribeSlot = socketService.subscribeToSlotUpdates((data) => {
      setIsSystemOnline(true);
      console.log("Slot update received:", data);
      
      let freeSlots = [];
      
      // Handle slot status updates
      if (data === "FULL") {
        setAvailableSlots(0);
        setFreeSlotsList([]);
        freeSlots = [];
      } else {
        // Parse comma-separated list of available slots
        freeSlots = data.split(",").map(Number);
        setFreeSlotsList(freeSlots);
        setAvailableSlots(freeSlots.length);
      }
      
      // Update realtime slots structure to match hardware data
      // IMPORTANT: Only update isOccupied, preserve reservation status
      setRealtimeSlots(prevSlots => 
        prevSlots.map(slot => ({
          ...slot,
          // A slot is occupied if it's not in the free list AND not reserved
          // Reserved slots should not be marked as occupied even if sensor detects something
          isOccupied: !freeSlots.includes(slot.slotNumber) && !slot.isReserved
        }))
      );
    });
    
    // Subscribe to database slot updates (for reservations)
    const unsubscribeDatabaseSlot = socketService.subscribeToDatabaseSlotUpdates((data) => {
      console.log("Database slot update received:", data);
      // Update the realtime slots with reservation info
      setRealtimeSlots(prevSlots => 
        prevSlots.map(slot => 
          slot.slotNumber === data.slotNumber 
            ? { 
                ...slot, 
                isOccupied: data.isOccupied,
                isReserved: data.isReserved,
                reservedBy: data.reservedBy || null,
                vehicleNumberPlate: data.vehicleNumberPlate || null
              }
            : slot
        )
      );
      
      // If a slot gets reserved, update the free slots list to exclude it
      if (data.isReserved) {
        setFreeSlotsList(prev => prev.filter(slotNum => slotNum !== data.slotNumber));
      } else if (!data.isOccupied) {
        // If a slot gets unreserved and not occupied, add it to free slots
        setFreeSlotsList(prev => {
          if (!prev.includes(data.slotNumber)) {
            return [...prev, data.slotNumber].sort();
          }
          return prev;
        });
      }
    });
    
    const unsubscribeGate = socketService.subscribeToGateUpdates((data) => {
      setIsSystemOnline(true); // Mark system as online when any data is received
      console.log("Gate update received:", data);
      setGateStatus(data);
    });
    const unsubscribeEntryGate = socketService.subscribeToEntryGateUpdates((data) => {
      setIsSystemOnline(true);
      setEntryGateStatus(String(data||'').toUpperCase());
    });
    const unsubscribeExitGate = socketService.subscribeToExitGateUpdates((data) => {
      setIsSystemOnline(true);
      setExitGateStatus(String(data||'').toUpperCase());
    });
    
    const unsubscribeDevice = socketService.subscribeToDeviceStatus((data) => {
      setIsSystemOnline(true); // Mark system as online when any data is received
      console.log("Device status update:", data);
    });
    
    // Cleanup subscriptions on component unmount
    return () => {
      unsubscribeSlot();
      unsubscribeDatabaseSlot();
      unsubscribeGate();
      unsubscribeEntryGate();
      unsubscribeExitGate();
      unsubscribeDevice();
    };
  }, [totalSlots]);

  // Update available slots count whenever realtime slots change
  useEffect(() => {
    const available = realtimeSlots.filter(slot => !slot.isOccupied && !slot.isReserved).length;
    setAvailableSlots(available);
  }, [realtimeSlots]);

  // Function to determine slot CSS class based on occupancy and reservation status
  const getSlotClass = (slotNumber) => {
    const slot = realtimeSlots.find(s => s.slotNumber === slotNumber);
    if (!slot) {
      // Fallback to old logic if slot not found in realtime data
      return freeSlotsList.includes(slotNumber) ? "slot available" : "slot occupied";
    }
    
    if (slot.isReserved) return "slot reserved";
    if (slot.isOccupied) return "slot occupied";
    return "slot available";
  };

  return (
    <div className="container">
      {/* Welcome Popup */}
      {showWelcomePopup && (
        <>
          <div className="overlay" onClick={() => setShowWelcomePopup(false)} />
          <div className="welcome-popup">
            <h2>Welcome to the Intelligent Urban Parking System</h2>
            <div className="system-status">
              <div className={`status-indicator ${isSystemOnline ? 'online' : 'offline'}`}>
                <span className={`status-dot ${isSystemOnline ? 'online' : 'offline'}`}></span>
                System {isSystemOnline ? 'Online' : 'Offline'}
              </div>
            </div>
            <button className="close-button" onClick={() => setShowWelcomePopup(false)}>
              Get Started
            </button>
          </div>
        </>
      )}

      <header>
        <h1>Smart Parking System</h1>
        <p className="subtitle">Real-time parking lot monitoring</p>
        <div className="device-status">
          System:{" "}
          {isSystemOnline && (
            <span className="status-online">ONLINE</span>
          )}
        </div>
        {user && (
          <div style={{ marginTop: 8 }}>
            <small>Signed in as {user.name} ({user.phone})</small>
            {Array.isArray(user.vehicles) && user.vehicles.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <small>Vehicles: {user.vehicles.map(v => `${v.type}:${v.numberPlate}`).join(', ')}</small>
              </div>
            )}
            <button style={{ marginLeft: 8 }} onClick={logout}>Logout</button>
          </div>
        )}
      </header>

      <main>
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'monitor' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitor')}
          >
            📊 Live Monitor
          </button>
          <button 
            className={`tab-button ${activeTab === 'reserve' ? 'active' : ''}`}
            onClick={() => setActiveTab('reserve')}
          >
            🚗 Reserve Slot
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'monitor' ? (
          <section className="status-section">
            <div className="status-card">
              <h2>Parking Availability</h2>
              <div className="availability-display">
                <div className="count-display">
                  <span id="available-count">{availableSlots}</span>
                  <span className="count-label">Available</span>
                </div>
                <div className="count-display">
                  <span id="total-count">{totalSlots}</span>
                  <span className="count-label">Total</span>
                </div>
              </div>

              <div className="slots-container">
                <h3>Slot Status</h3>
                <div className="parking-grid">
                  {Array.from({length: totalSlots}, (_, i) => i + 1).map(slotNum => (
                    <div
                      key={slotNum}
                      className={getSlotClass(slotNum)}
                      id={`slot-${slotNum}`}
                    >
                      {slotNum}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="status-card">
              <h2>Gate Status</h2>
              <div className="gate-status">
                <div 
                  className={`gate-indicator ${gateStatus === "OPEN" ? "open" : "closed"}`} 
                  id="gate-indicator"
                ></div>
                <span id="gate-status-text">{gateStatus}</span>
              </div>
              <div className="gate-info" style={{marginTop:8}}>
                <small>Entry: {entryGateStatus} | Exit: {exitGateStatus}</small>
              </div>
              <div className="gate-info">
                <p>
                  The gate automatically opens when a vehicle is detected and parking space is available.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="reservation-section">
            <SlotReservation user={user} realtimeSlots={realtimeSlots} />
          </section>
        )}
      </main>

      <footer>
        <p>&copy; 2025 Smart Parking System</p>
        <Link to="/admin" className="admin-link">Admin Panel</Link>
      </footer>
    </div>
  );
}