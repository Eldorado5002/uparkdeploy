// src/pages/Admin.jsx
import React, { useEffect, useState } from "react";
import "./admin.css";
import { Link } from "react-router-dom";
import socketService from "../services/socketService";

export default function Admin() {
  const [availableSlots, setAvailableSlots] = useState(0);
  const [totalSlots] = useState(6);
  const [gateStatus, setGateStatus] = useState("CLOSED"); // legacy single status
  const [entryGateStatus, setEntryGateStatus] = useState("CLOSED");
  const [exitGateStatus, setExitGateStatus] = useState("CLOSED");
  const [freeSlotsList, setFreeSlotsList] = useState([]);
  const [isSystemOnline, setIsSystemOnline] = useState(false);

  useEffect(() => {
    console.log("Admin page loaded");
    
    // Subscribe to real-time updates from the ESP32
    const unsubscribeSlot = socketService.subscribeToSlotUpdates((data) => {
      setIsSystemOnline(true); // Mark system as online when any data is received
      console.log("Slot update received:", data);
      
      // Handle slot status updates
      if (data === "FULL") {
        setAvailableSlots(0);
        setFreeSlotsList([]);
      } else {
        // Parse comma-separated list of available slots
        const freeSlots = data.split(",").map(Number);
        setFreeSlotsList(freeSlots);
        setAvailableSlots(freeSlots.length);
      }
    });
    
    const unsubscribeGate = socketService.subscribeToGateUpdates((data) => {
      setIsSystemOnline(true); // Mark system as online when any data is received
      console.log("Gate update received:", data);
      setGateStatus(data);
    });

    const unSubEntry = socketService.subscribeToEntryGateUpdates((data) => {
      setIsSystemOnline(true);
      console.log("Entry gate update:", data);
      setEntryGateStatus(String(data || '').toUpperCase());
    });

    const unSubExit = socketService.subscribeToExitGateUpdates((data) => {
      setIsSystemOnline(true);
      console.log("Exit gate update:", data);
      setExitGateStatus(String(data || '').toUpperCase());
    });
    
    // Cleanup subscriptions on component unmount
    return () => {
      unsubscribeSlot();
      unsubscribeGate();
      unSubEntry();
      unSubExit();
    };
  }, [totalSlots]);

  // Function to determine slot CSS class based on occupancy
  const getSlotClass = (slotNumber) => {
    return freeSlotsList.includes(slotNumber) ? "slot available" : "slot occupied";
  };

  // Handle gate control actions
  const handleOpenGate = () => socketService.openGate();
  const handleCloseGate = () => socketService.closeGate();

  const openEntryGate = () => socketService.openEntryGate();
  const closeEntryGate = () => socketService.closeEntryGate();
  const openExitGate = () => socketService.openExitGate();
  const closeExitGate = () => socketService.closeExitGate();

  // Admin override: click slot to set state
  const onClickSlot = (slotNumber) => {
    const choice = window.prompt(`Set state for slot ${slotNumber}. Enter one of: AVAILABLE, RESERVED, OCCUPIED`, "AVAILABLE");
    if (!choice) return;
    const state = choice.trim().toUpperCase();
    if (!["AVAILABLE","RESERVED","OCCUPIED"].includes(state)) return alert("Invalid state");
    socketService.adminOverrideSlot({ slotNumber, state });
  };

  return (
    <div className="container admin-container">
      <header>
        <h1>Parking System Admin Panel</h1>
        <p className="subtitle">System management and controls</p>
        <div className="device-status">
          System:{" "}
          <span className={isSystemOnline ? "status-online" : ""}>
            {isSystemOnline ? "ONLINE" : ""}
          </span>
        </div>
      </header>

      <main>
        <section className="admin-section">
          <div className="status-card">
            <h2>System Status</h2>
            <div className="status-display">
              <div className="status-item">
                <span className="status-label">Available Slots:</span>
                <span id="available-count">{availableSlots}</span>/
                <span id="total-count">{totalSlots}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Gate Status:</span>
                <span id="gate-status-text">{gateStatus}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Free Slots:</span>
                <span id="free-slots-list">
                  {freeSlotsList.length > 0 ? freeSlotsList.join(", ") : "None"}
                </span>
              </div>
            </div>
          </div>

          <div className="control-card">
            <h2>Gate Control</h2>
            <div className="status-display" style={{marginBottom: 12}}>
              <div className="status-item"><span className="status-label">Entry:</span> {entryGateStatus}</div>
              <div className="status-item"><span className="status-label">Exit:</span> {exitGateStatus}</div>
            </div>
            <div className="button-group" style={{gap:8, flexWrap:'wrap'}}>
              <button className="control-button open" onClick={openEntryGate} disabled={entryGateStatus === 'OPEN'}>Open Entry</button>
              <button className="control-button close" onClick={closeEntryGate} disabled={entryGateStatus === 'CLOSED'}>Close Entry</button>
              <button className="control-button open" onClick={openExitGate} disabled={exitGateStatus === 'OPEN'}>Open Exit</button>
              <button className="control-button close" onClick={closeExitGate} disabled={exitGateStatus === 'CLOSED'}>Close Exit</button>
              {/* Legacy combined controls kept for compatibility */}
              <button id="open-gate" className="control-button open" onClick={handleOpenGate} disabled={gateStatus === 'OPEN'}>Open (Legacy)</button>
              <button id="close-gate" className="control-button close" onClick={handleCloseGate} disabled={gateStatus === 'CLOSED'}>Close (Legacy)</button>
            </div>
          </div>

          <div className="slots-card">
            <h2>Parking Slots Overview</h2>
            <div className="slots-container">
              <div className="parking-grid admin-grid">
                {Array.from({length: totalSlots}, (_, i) => i + 1).map(slotNum => (
                  <div
                    key={slotNum}
                    className={getSlotClass(slotNum)}
                    id={`admin-slot-${slotNum}`}
                    onClick={() => onClickSlot(slotNum)}
                    title="Click to override state"
                    style={{cursor:'pointer'}}
                  >
                    {slotNum}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Removed simulation-card (System Controls) */}
        </section>
      </main>

      <footer>
        <p>&copy; 2025 Smart Parking System</p>
        <Link to="/" className="admin-link">Back to Public View</Link>
      </footer>
    </div>
  );
}