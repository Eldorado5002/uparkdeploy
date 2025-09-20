import React, { useState, useEffect } from 'react';
import './SlotReservation.css';
import socketService from '../services/socketService';

const SlotReservation = ({ user, realtimeSlots }) => {
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [userReservations, setUserReservations] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [bookingDuration, setBookingDuration] = useState(1);
  const [durationType, setDurationType] = useState('HOURLY');
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [bookingProfile, setBookingProfile] = useState(null);

  // Use realtime slots if provided, otherwise fetch from API
  useEffect(() => {
    if (realtimeSlots && realtimeSlots.length > 0) {
      console.log('Using realtime slots:', realtimeSlots);
      setSlots(realtimeSlots);
    } else {
      console.log('No realtime slots provided, fetching from API');
      fetchSlots();
    }
  }, [realtimeSlots]);

  // Update local slots when realtime slots change
  useEffect(() => {
    if (realtimeSlots && realtimeSlots.length > 0) {
      setSlots(realtimeSlots);
    }
  }, [realtimeSlots]);

  useEffect(() => {
    // Only fetch user-specific data
    if (user && user.phone) {
      fetchUserReservations();
      fetchBookingProfile();
    }

    // If no realtime slots provided, set up traditional socket subscriptions
    if (!realtimeSlots || realtimeSlots.length === 0) {
      // Subscribe to real-time slot updates
      const unsubscribeSlot = socketService.subscribeToSlotUpdates((data) => {
        console.log("SlotReservation: Real-time slot update received:", data);
        // Refresh slots when we receive real-time updates
        fetchSlots();
      });

      // Subscribe to database slot updates (when hardware data syncs with database)
      const unsubscribeDatabaseSlot = socketService.subscribeToDatabaseSlotUpdates((data) => {
        console.log("SlotReservation: Database slot update received:", data);
        // Update local slots state immediately for better user experience
        setSlots(prevSlots => {
          const updatedSlots = prevSlots.map(slot => 
            slot.slotNumber === data.slotNumber 
              ? { 
                  ...slot, 
                  isOccupied: data.isOccupied, 
                  isReserved: data.isReserved,
                  reservedBy: data.reservedBy || null,
                  vehicleNumberPlate: data.vehicleNumberPlate || null
                }
              : slot
          );
          console.log(`Updated slot ${data.slotNumber} locally:`, updatedSlots.find(s => s.slotNumber === data.slotNumber));
          return updatedSlots;
        });
      });

      // Also set up periodic refresh as backup (every 10 seconds)
      const intervalId = setInterval(() => {
        fetchSlots();
      }, 10000);

      // Cleanup subscription and interval on component unmount
      return () => {
        unsubscribeSlot();
        unsubscribeDatabaseSlot();
        clearInterval(intervalId);
      };
    }
  }, [user, realtimeSlots]);

  useEffect(() => {
    if (selectedVehicle) {
      calculatePrice();
    }
  }, [selectedVehicle, bookingDuration, durationType]);

  const fetchSlots = async () => {
    try {
      setRefreshing(true);
      console.log('Fetching slots...');
      const response = await fetch('/api/slots');
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Fetched slots data:', data);
      if (data.success) {
        console.log('Previous slots:', slots.length > 0 ? slots : 'empty');
        setSlots(data.slots);
        console.log('Slots set to state:', data.slots);
        console.log('Available slots count:', data.slots.filter(s => !s.isOccupied && !s.isReserved).length);
        console.log('Reserved slots count:', data.slots.filter(s => s.isReserved).length);
        console.log('Occupied slots count:', data.slots.filter(s => s.isOccupied).length);
      } else {
        console.error('Failed to fetch slots:', data);
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchUserReservations = async () => {
    try {
      const response = await fetch(`/api/reservations/user/${user.phone}`);
      const data = await response.json();
      if (data.success) {
        setUserReservations(data.reservations);
      }
    } catch (error) {
      console.error('Error fetching reservations:', error);
    }
  };

  const fetchBookingProfile = async () => {
    try {
      const response = await fetch(`/api/users/booking-profile/${user.phone}`);
      const data = await response.json();
      if (data.success) {
        setBookingProfile(data.profile);
      }
    } catch (error) {
      console.error('Error fetching booking profile:', error);
    }
  };

  const calculatePrice = async () => {
    if (!selectedVehicle) return;
    
    try {
      const response = await fetch('/api/reservations/calculate-price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleType: selectedVehicle.type,
          duration: bookingDuration,
          durationType
        })
      });

      const data = await response.json();
      if (data.success) {
        setCalculatedPrice(data.pricing.totalAmount);
      }
    } catch (error) {
      console.error('Error calculating price:', error);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleSlotClick = (slot) => {
    if (slot.isOccupied || slot.isReserved) {
      showMessage('This slot is not available', 'error');
      return;
    }

    // Check if user already has an active reservation
    const activeReservation = userReservations.find(r => 
      r.status === 'ACTIVE' && (r.paymentStatus === 'PENDING' || r.paymentStatus === 'COMPLETED')
    );
    
    if (activeReservation) {
      showMessage('You already have an active reservation', 'error');
      return;
    }

    if (!user.vehicles || user.vehicles.length === 0) {
      showMessage('Please add vehicles to your profile first', 'error');
      return;
    }

    setSelectedSlot(slot);
    setShowVehicleModal(true);
  };

  const handleVehicleSelect = (vehicle) => {
    setSelectedVehicle(vehicle);
    setShowVehicleModal(false);
    setShowPaymentModal(true);
  };

  const createReservation = async () => {
    if (!selectedSlot || !selectedVehicle) return;

    setLoading(true);
    
    // Only do optimistic update if we're not using realtime slots from parent
    // (because realtime slots will be updated by the parent component via Socket.IO)
    const originalSlots = [...slots];
    if (!realtimeSlots || realtimeSlots.length === 0) {
      // Optimistic update: immediately mark slot as reserved in UI
      setSlots(prevSlots => 
        prevSlots.map(slot => 
          slot.slotNumber === selectedSlot.slotNumber 
            ? { ...slot, isReserved: true, reservedBy: user.phone, vehicleNumberPlate: selectedVehicle.numberPlate }
            : slot
        )
      );
    }
    
    try {
      const response = await fetch('/api/reservations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: user.phone,
          slotNumber: selectedSlot.slotNumber,
          vehicleNumberPlate: selectedVehicle.numberPlate,
          vehicleType: selectedVehicle.type,
          duration: bookingDuration,
          durationType,
          bookingStartTime: new Date().toISOString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setReservation(data.reservation);
        showMessage('Reservation created successfully!', 'success');
        setShowPaymentModal(false);
        setSelectedSlot(null);
        setSelectedVehicle(null);
        setReservation(null);
        // If using realtime slots, don't fetch - parent will update via Socket.IO
        if (!realtimeSlots || realtimeSlots.length === 0) {
          fetchSlots();
        }
        fetchUserReservations(); // Refresh user reservations
        fetchBookingProfile(); // Refresh booking profile
      } else {
        // Revert optimistic update on error (only if not using realtime slots)
        if (!realtimeSlots || realtimeSlots.length === 0) {
          setSlots(originalSlots);
        }
        showMessage(data.error || 'Failed to create reservation', 'error');
        setShowPaymentModal(false);
      }
    } catch (error) {
      console.error('Error creating reservation:', error);
      // Revert optimistic update on error (only if not using realtime slots)
      if (!realtimeSlots || realtimeSlots.length === 0) {
        setSlots(originalSlots);
      }
      showMessage('Failed to create reservation', 'error');
      setShowPaymentModal(false);
    }
    setLoading(false);
  };

  const processPayment = async () => {
    if (!reservation) return;

    setLoading(true);
    try {
      const response = await fetch('/api/reservations/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationId: reservation.id,
          paymentMethod: 'MOCK'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage(`Payment successful! Slot ${reservation.slotNumber} is now reserved.`, 'success');
        setShowPaymentModal(false);
        setSelectedSlot(null);
        setSelectedVehicle(null);
        setReservation(null);
        fetchSlots(); // Refresh slots
        fetchUserReservations(); // Refresh user reservations
      } else {
        showMessage(data.error || 'Payment failed', 'error');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      showMessage('Payment failed', 'error');
    }
    setLoading(false);
  };

  const cancelReservation = async (reservationId) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;

    try {
      const response = await fetch('/api/reservations/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationId,
          userPhone: user.phone
        })
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage('Reservation cancelled successfully', 'success');
        fetchSlots();
        fetchUserReservations();
      } else {
        showMessage(data.error || 'Failed to cancel reservation', 'error');
      }
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      showMessage('Failed to cancel reservation', 'error');
    }
  };

  const getSlotClass = (slot) => {
    if (slot.isOccupied) return 'slot occupied';
    if (slot.isReserved) return 'slot reserved';
    return 'slot available';
  };

  const getSlotStatus = (slot) => {
    if (slot.isOccupied) return 'Occupied';
    if (slot.isReserved) return 'Reserved';
    return 'Available';
  };

  return (
    <div className="slot-reservation-container">
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <header>
        <h1>🚗 Parking Slot Reservation</h1>
        <p className="subtitle">Select an available slot to make a reservation</p>
      </header>

      <main>
        <section className="admin-section">
          {/* Status Overview Card */}
          <div className="status-card">
            <h2>Parking Status</h2>
            <div className="availability-display">
              <div className="count-display">
                <span>{slots.filter(s => !s.isOccupied && !s.isReserved).length}</span>
                <span className="count-label">Available</span>
              </div>
              <div className="count-display">
                <span>{slots.length}</span>
                <span className="count-label">Total</span>
              </div>
            </div>
          </div>

          {/* User Booking Profile */}
          {bookingProfile && (
            <div className="control-card">
              <h2>👤 Your Profile</h2>
              <div className="status-display">
                <div className="status-item">
                  <span className="status-label">Total Bookings:</span>
                  <span>{bookingProfile.totalReservations}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Active:</span>
                  <span>{bookingProfile.activeReservations}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Total Spent:</span>
                  <span>₹{bookingProfile.totalAmountSpent || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Parking Slots Grid Card */}
          <div className="slots-card">
            <h2>
              Select a Parking Slot 
              {refreshing && <span style={{color: '#3498db', fontSize: '0.8rem', marginLeft: '10px'}}>🔄 Refreshing...</span>}
              <button 
                onClick={fetchSlots} 
                style={{
                  marginLeft: '10px', 
                  padding: '5px 10px', 
                  backgroundColor: '#3498db', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
                disabled={refreshing}
              >
                🔄 Refresh
              </button>
            </h2>
            <div className="slots-container">
              <div className="legend" style={{display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px'}}>
                <div className="legend-item">
                  <span className="legend-color available" style={{display: 'inline-block', width: '20px', height: '20px', backgroundColor: '#2ecc71', marginRight: '8px'}}></span>
                  <span>Available</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color reserved" style={{display: 'inline-block', width: '20px', height: '20px', backgroundColor: '#f39c12', marginRight: '8px'}}></span>
                  <span>Reserved</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color occupied" style={{display: 'inline-block', width: '20px', height: '20px', backgroundColor: '#e74c3c', marginRight: '8px'}}></span>
                  <span>Occupied</span>
                </div>
              </div>

              <div className="parking-grid admin-grid">
                {console.log('Rendering slots, count:', slots.length, 'slots:', slots)}
                {slots.map(slot => (
                  <div
                    key={slot.slotNumber}
                    className={getSlotClass(slot)}
                    onClick={() => handleSlotClick(slot)}
                    title={`Slot ${slot.slotNumber} - ${getSlotStatus(slot)}${!slot.isOccupied && !slot.isReserved ? ' - Click to reserve' : ''}`}
                    style={{cursor: (!slot.isOccupied && !slot.isReserved) ? 'pointer' : 'default'}}
                  >
                    {slot.slotNumber}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

        {/* Active Reservations */}
        {userReservations.length > 0 && (
          <div className="user-reservations">
            <h3>📋 Your Reservations</h3>
            <div className="reservations-list">
              {userReservations
                .filter(r => r.status === 'ACTIVE' || r.paymentStatus === 'PENDING')
                .map(reservation => (
                <div key={reservation._id} className="reservation-card">
                  <div className="reservation-info">
                    <strong>Slot #{reservation.slotNumber}</strong>
                    <p>Vehicle: {reservation.vehicleNumberPlate} ({reservation.vehicleType})</p>
                    <p>Duration: {reservation.bookingDuration}h ({reservation.durationType})</p>
                    <p>Amount: ₹{reservation.totalAmount}</p>
                    <p>Start: {new Date(reservation.bookingStartTime).toLocaleString()}</p>
                    <p>End: {new Date(reservation.bookingEndTime).toLocaleString()}</p>
                    <p>Status: <span className={`status-${reservation.status?.toLowerCase()}`}>{reservation.status}</span></p>
                    <small>Booked: {new Date(reservation.createdAt).toLocaleString()}</small>
                  </div>
                  <button 
                    onClick={() => cancelReservation(reservation._id)}
                    className="cancel-btn"
                    disabled={reservation.status !== 'ACTIVE'}
                  >
                    {reservation.status === 'ACTIVE' ? 'Cancel' : 'Cancelled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Vehicle Selection Modal */}
      {showVehicleModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Select Vehicle for Slot #{selectedSlot?.slotNumber}</h3>
              <button onClick={() => setShowVehicleModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="duration-selection">
                <h4>Select Parking Duration</h4>
                <div className="duration-controls">
                  <div className="duration-type-tabs">
                    <button 
                      className={`duration-tab ${durationType === 'HOURLY' ? 'active' : ''}`}
                      onClick={() => setDurationType('HOURLY')}
                    >
                      Hourly
                    </button>
                    <button 
                      className={`duration-tab ${durationType === 'DAILY' ? 'active' : ''}`}
                      onClick={() => setDurationType('DAILY')}
                    >
                      Daily
                    </button>
                  </div>
                  
                  <div className="duration-input">
                    <label>
                      {durationType === 'HOURLY' ? 'Hours:' : 'Days:'}
                      <input 
                        type="number" 
                        min="1" 
                        max={durationType === 'HOURLY' ? '24' : '7'} 
                        value={bookingDuration}
                        onChange={(e) => setBookingDuration(parseInt(e.target.value) || 1)}
                      />
                    </label>
                  </div>
                </div>
                
                <div className="pricing-info">
                  <p><strong>Rates:</strong></p>
                  <p>2-Wheeler: ₹10/hour or ₹80/day</p>
                  <p>4-Wheeler: ₹20/hour or ₹150/day</p>
                </div>
              </div>
              
              <div className="vehicles-list">
                {user.vehicles.map((vehicle, index) => (
                  <div 
                    key={index}
                    className="vehicle-card"
                    onClick={() => handleVehicleSelect(vehicle)}
                  >
                    <div className="vehicle-info">
                      <strong>{vehicle.numberPlate}</strong>
                      <span className={`vehicle-type ${vehicle.type === '2W' ? 'tw' : 'fw'}`}>
                        {vehicle.type === '2W' ? 'Two Wheeler' : 'Four Wheeler'}
                      </span>
                    </div>
                    <div className="vehicle-rate">
                      ₹{durationType === 'HOURLY' 
                        ? (vehicle.type === '2W' ? 10 : 20) * bookingDuration
                        : (vehicle.type === '2W' ? 80 : 150) * Math.ceil(bookingDuration / 24)
                      }
                      <small>for {bookingDuration} {durationType === 'HOURLY' ? 'hour(s)' : 'day(s)'}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Confirmation Modal */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal payment-modal">
            <div className="modal-header">
              <h3>Confirm Booking</h3>
              <button onClick={() => setShowPaymentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="booking-summary">
                <h4>Booking Details</h4>
                <div className="booking-details">
                  <p><strong>Slot:</strong> #{selectedSlot?.slotNumber}</p>
                  <p><strong>Vehicle:</strong> {selectedVehicle?.numberPlate}</p>
                  <p><strong>Type:</strong> {selectedVehicle?.type === '2W' ? 'Two Wheeler' : 'Four Wheeler'}</p>
                  <p><strong>Duration:</strong> {bookingDuration} {durationType === 'HOURLY' ? 'hour(s)' : 'day(s)'}</p>
                  <p><strong>Start Time:</strong> {new Date().toLocaleString()}</p>
                  <p><strong>End Time:</strong> {new Date(Date.now() + bookingDuration * 60 * 60 * 1000).toLocaleString()}</p>
                  <p><strong>Total Amount:</strong> ₹{calculatedPrice}</p>
                </div>
                
                <div className="booking-terms">
                  <label className="terms-checkbox">
                    <input type="checkbox" required />
                    <span>I agree to the parking terms and conditions</span>
                  </label>
                </div>
              </div>
              
              <button 
                onClick={createReservation}
                disabled={loading}
                className="confirm-booking-btn"
              >
                {loading ? 'Creating Reservation...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlotReservation;