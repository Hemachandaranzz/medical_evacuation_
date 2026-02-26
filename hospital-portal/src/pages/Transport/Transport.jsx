import React, { useState, useEffect } from 'react';
import { Truck, MapPin, User, Navigation, RefreshCw, Clock, Building2, Car, CheckCircle } from 'lucide-react';
import TransportTimeline from '../../components/Transport/TransportTimeline';
import LiveDriverMap from '../../components/LiveDriverMap/LiveDriverMap';
import { supabase } from '../../services/supabaseClient';
import api from '../../services/api';
import './Transport.css';

const Transport = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [trackingBookingId, setTrackingBookingId] = useState(null);

    const fetchBookings = async () => {
        // Only set loading on initial fetch if empty
        if (bookings.length === 0) setLoading(true);
        try {
            const res = await api.get('/bookings/hospital');
            setBookings(res.data?.data || []);
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookings();

        // REAL-TIME SUBSCRIPTIONS
        const bookingsChannel = supabase
            .channel('hospital_transport_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_bookings' },
                (payload) => {
                    console.log('Booking update:', payload);
                    fetchBookings();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_assignments' },
                (payload) => {
                    console.log('Assignment update:', payload);
                    fetchBookings();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(bookingsChannel);
        };
    }, []);

    const getStatusDisplay = (booking) => {
        // Priority: Active Assignment Status > Booking Status
        const activeAssignment = booking.assignments?.[0];

        let status = booking.booking_status;
        let label = booking.booking_status?.replace(/_/g, ' ');

        if (activeAssignment && booking.booking_status !== 'completed' && booking.booking_status !== 'cancelled') {
            if (['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'].includes(activeAssignment.current_status)) {
                status = activeAssignment.current_status;
                label = activeAssignment.current_status.replace(/_/g, ' ');
            }
        }

        return { status, label };
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return 'warning';
            case 'confirmed': return 'info';
            case 'driver_assigned':
            case 'accepted': return 'info';
            case 'in_progress':
            case 'en_route_pickup':
            case 'en_route_hospital': return 'warning';
            case 'patient_loaded': return 'primary';
            case 'completed':
            case 'delivered': return 'success';
            case 'cancelled': return 'neutral';
            default: return 'neutral';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return <Clock size={16} />;
            case 'completed':
            case 'delivered': return <CheckCircle size={16} />;
            case 'patient_loaded': return <User size={16} />;
            default: return <Truck size={16} />;
        }
    };

    if (loading && bookings.length === 0) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading incoming transport...</p>
            </div>
        );
    }

    return (
        <div className="transport-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Incoming Transport</h1>
                    <p className="page-description">Monitor incoming ambulance arrivals</p>
                </div>
                <button className="track-driver-btn" style={{ width: 'auto' }} onClick={fetchBookings}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {bookings.length === 0 ? (
                <div className="empty-state">
                    <Truck size={48} />
                    <h3>No Incoming Transport</h3>
                    <p>There are no active transport requests destined for this hospital.</p>
                </div>
            ) : (
                <div className="bookings-grid">
                    {bookings.map((booking) => {
                        const { status, label } = getStatusDisplay(booking);
                        const assignment = booking.assignments?.[0];

                        // Fallback timeline data if explicit assignment is missing but status implies it
                        const timelineData = assignment || {
                            current_status: status,
                            accepted_at: booking.confirmed_at,
                            pickup_started_at: booking.started_at,
                            completed_at: booking.completed_at
                        };

                        return (
                            <div key={booking.id} className={`booking-card ${status}`}>
                                <div className="booking-header">
                                    <div className="booking-patient">
                                        <User size={18} />
                                        <span>{booking.patient?.name || 'Unknown Patient'}</span>
                                    </div>
                                    <span className={`badge badge-${getStatusBadge(status)}`}>
                                        {getStatusIcon(status)}
                                        {label}
                                    </span>
                                </div>

                                <div className="booking-body">
                                    <div className="booking-info-row">
                                        <Building2 size={16} />
                                        <div>
                                            <label>Reviewing Clinic</label>
                                            <span>{booking.clinic?.name || 'Unknown Clinic'}</span>
                                        </div>
                                    </div>

                                    <div className="booking-info-row">
                                        <Car size={16} />
                                        <div>
                                            <label>Vehicle</label>
                                            <span>{booking.vehicle?.vehicle_name || 'N/A'} ({booking.vehicle?.vehicle_type || 'N/A'})</span>
                                        </div>
                                    </div>

                                    {/* Display Driver Name if assigned */}
                                    {assignment?.driver && (
                                        <div className="booking-info-row">
                                            <User size={16} />
                                            <div>
                                                <label>Driver</label>
                                                <span>{assignment.driver.full_name}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="booking-info-row">
                                        <MapPin size={16} />
                                        <div>
                                            <label>Pickup Location</label>
                                            <span>{booking.pickup_location}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="booking-footer">
                                    <div className="footer-top">
                                        <div className="booking-time">
                                            <Clock size={14} />
                                            <span>Requested: {new Date(booking.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className={`urgency-badge ${booking.urgency}`}>
                                            {booking.urgency}
                                        </div>
                                    </div>

                                    <TransportTimeline assignment={timelineData} />

                                    {/* Track Driver Button */}
                                    {assignment && ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'].includes(status) && (
                                        <button
                                            className="track-driver-btn"
                                            onClick={() => setTrackingBookingId(
                                                trackingBookingId === assignment.id ? null : assignment.id
                                            )}
                                        >
                                            <Navigation size={14} />
                                            {trackingBookingId === assignment.id ? 'Hide Map' : 'Track Driver'}
                                        </button>
                                    )}
                                </div>

                                {/* Live Map — shown below the card footer */}
                                {trackingBookingId === assignment?.id && (
                                    <LiveDriverMap
                                        bookingId={trackingBookingId}
                                        onClose={() => setTrackingBookingId(null)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Transport;
