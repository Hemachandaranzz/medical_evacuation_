import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../services/apiClient';
import { createClient } from '@supabase/supabase-js';
import {
    Truck,
    Clock,
    CheckCircle,
    MapPin,
    User,
    Building2,
    Car,
    Loader2,
    Plus,
} from 'lucide-react';
import TransportBookingModal from '../../components/TransportBookingModal/TransportBookingModal';
import TransportTimeline from '../../components/Transport/TransportTimeline';
import LiveDriverMap from '../../components/LiveDriverMap/LiveDriverMap';
import './Transport.css';

import { supabase } from '../../services/supabaseClient';

export default function Transport() {
    const [bookings, setBookings] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [clinicRegion, setClinicRegion] = useState('');
    const [trackingBookingId, setTrackingBookingId] = useState(null);
    const location = useLocation();

    useEffect(() => {
        fetchData();
        fetchClinicInfo();

        // Check for redirect action from Patients page
        if (location.state?.openBooking) {
            setShowBookingModal(true);
        }

        // REAL-TIME SUBSCRIPTIONS
        const bookingsChannel = supabase
            .channel('clinical_transport_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_bookings' },
                (payload) => {
                    console.log('Booking update:', payload);
                    fetchData(); // Simplest way to keep data consistent
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_assignments' },
                (payload) => {
                    console.log('Assignment update:', payload);
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(bookingsChannel);
        };
    }, []);

    const fetchClinicInfo = async () => {
        try {
            const response = await api.get('/clinics/me');
            setClinicRegion(response.data?.location_name || '');
        } catch (err) {
            console.error('Error fetching clinic info:', err);
        }
    };

    const fetchData = async () => {
        try {
            // setLoading(true); // Don't show full loader on refresh to keep UI smooth

            // Fetch transport bookings
            const bookingRes = await api.get('/bookings/clinic');
            setBookings(bookingRes.data || []);

            // Fetch patients for modal
            const patientRes = await api.get('/patients');
            setPatients(patientRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusDisplay = (booking) => {
        // Priority: Active Assignment Status > Booking Status
        const activeAssignment = booking.assignments?.[0]; // Assuming order decending in backend or just take first

        let status = booking.booking_status;
        let label = booking.booking_status?.replace(/_/g, ' ');

        if (activeAssignment && booking.booking_status !== 'completed' && booking.booking_status !== 'cancelled') {
            console.log(`[Transport] Booking ${booking.id} has active assignment:`, activeAssignment.current_status);
            // If there is an active assignment, use its detailed status
            if (['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'].includes(activeAssignment.current_status)) {
                status = activeAssignment.current_status;
                label = activeAssignment.current_status.replace(/_/g, ' ');
            }
        } else {
            console.log(`[Transport] Booking ${booking.id} has NO active assignment or is completed/cancelled.`);
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
            case 'patient_loaded': return 'primary'; // Distinct color for patient loaded
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

    const handleBookingCreated = () => {
        setShowBookingModal(false);
        fetchData();
    };

    return (
        <div className="transport-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Transport Bookings</h1>
                    <p className="page-description">Track and manage patient transport requests</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowBookingModal(true)}>
                    <Plus size={18} />
                    Book Transport
                </button>
            </div>

            {loading ? (
                <div className="loading-state">
                    <Loader2 className="spinner" size={48} />
                    <p>Loading bookings...</p>
                </div>
            ) : bookings.length === 0 ? (
                <div className="empty-state">
                    <Truck size={64} />
                    <h3>No Transport Bookings</h3>
                    <p>Book transport for patients who need to be transferred</p>
                    <button className="btn btn-primary" onClick={() => setShowBookingModal(true)}>
                        <Plus size={18} />
                        Book Transport
                    </button>
                </div>
            ) : (
                <div className="bookings-grid">
                    {bookings.map((booking) => {
                        const { status, label } = getStatusDisplay(booking);
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
                                            <label>Transport Company</label>
                                            <span>{booking.company?.company_name || 'N/A'}</span>
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
                                    {booking.assignments?.[0]?.driver && (
                                        <div className="booking-info-row">
                                            <User size={16} />
                                            <div>
                                                <label>Driver</label>
                                                <span>{booking.assignments[0].driver.full_name}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="booking-info-row">
                                        <MapPin size={16} />
                                        <div>
                                            <label>Pickup</label>
                                            <span>{booking.pickup_location || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="booking-info-row">
                                        <MapPin size={16} />
                                        <div>
                                            <label>Destination</label>
                                            <span>{booking.destination_location || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="booking-footer">
                                    <span className="booking-time">
                                        <Clock size={14} />
                                        {new Date(booking.created_at).toLocaleString()}
                                    </span>
                                    {booking.urgency_level && (
                                        <span className={`urgency-badge ${booking.urgency_level}`}>
                                            {booking.urgency_level}
                                        </span>
                                    )}
                                    {/* Timeline Visualization for Active Assignments */}
                                    {booking.assignments?.[0] && booking.booking_status !== 'cancelled' && (
                                        <TransportTimeline assignment={booking.assignments[0]} />
                                    )}

                                    {/* Track Driver Button */}
                                    {booking.assignments?.[0] && ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'].includes(booking.assignments[0].current_status) && (
                                        <button
                                            className="track-driver-btn"
                                            onClick={() => setTrackingBookingId(
                                                trackingBookingId === booking.assignments[0].id ? null : booking.assignments[0].id
                                            )}
                                        >
                                            <MapPin size={14} />
                                            {trackingBookingId === booking.assignments[0].id ? 'Hide Map' : 'Track Driver'}
                                        </button>
                                    )}
                                </div>

                                {/* Live Map — shown below the card footer */}
                                {trackingBookingId === booking.assignments?.[0]?.id && (
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

            {/* Transport Booking Modal */}
            {showBookingModal && (
                <TransportBookingModal
                    isOpen={showBookingModal}
                    patients={patients}
                    onClose={() => setShowBookingModal(false)}
                    onBookingCreated={handleBookingCreated}
                    clinicRegion={clinicRegion}
                />
            )}
        </div>
    );
}
