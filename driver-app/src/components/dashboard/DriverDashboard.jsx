import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../../lib/supabase'
import { User, LogOut, Bell, MapPin, Clock } from 'lucide-react'
import './DriverDashboard.css'

export default function DriverDashboard({ driver, onUpdate }) {
    const navigate = useNavigate()
    const [stats, setStats] = useState({
        tripsToday: 0,
        totalTrips: 0,
        activeTrip: null,
        pendingRequests: []
    })

    // OPTIMISTIC UI STATE
    const [optimisticStatus, setOptimisticStatus] = useState(driver.current_status)
    const [isSyncing, setIsSyncing] = useState(false)

    // Sync optimistic state when real data changes
    useEffect(() => {
        setOptimisticStatus(driver.current_status)
    }, [driver.current_status])

    useEffect(() => {
        loadStats()

        // Subscribe to real-time driver updates (for status changes)
        const driversChannel = supabase
            .channel('driver_status_changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'drivers',
                    filter: `id=eq.${driver.id}`
                },
                (payload) => {
                    console.log('Driver status changed:', payload)
                    onUpdate(driver.user_id) // Reload driver data
                }
            )
            .subscribe()

        // Subscribe to transport assignment updates
        const assignmentsChannel = supabase
            .channel('driver_assignments_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'transport_assignments',
                    filter: `driver_id=eq.${driver.id}`
                },
                (payload) => {
                    console.log('Assignment changed:', payload)
                    loadStats() // Reload stats when assignments change
                }
            )
            .subscribe()

        // Subscribe to new requests (so they appear in "Available Requests")
        const requestsChannel = supabase
            .channel('driver_available_requests')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_requests' },
                () => loadStats()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_bookings' },
                () => loadStats()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(driversChannel)
            supabase.removeChannel(assignmentsChannel)
            supabase.removeChannel(requestsChannel)
        }
    }, [driver])

    const loadStats = async () => {
        try {
            // Get trips today
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const { count: tripsToday } = await supabase
                .from('transport_assignments')
                .select('*', { count: 'exact', head: true })
                .eq('driver_id', driver.id)
                .eq('current_status', 'delivered')
                .gte('completed_at', today.toISOString())

            // Get total trips
            const { count: totalTrips } = await supabase
                .from('transport_assignments')
                .select('*', { count: 'exact', head: true })
                .eq('driver_id', driver.id)
                .eq('current_status', 'delivered')

            // Check for active trip
            const { data: activeTrip } = await supabase
                .from('transport_assignments')
                .select('*, transport_requests(*), transport_bookings(*)')
                .eq('driver_id', driver.id)
                .in('current_status', ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'])
                .maybeSingle()

            // FETCH PENDING REQUESTS (Available for acceptance)
            // 1. Get company ID content
            let pendingReqs = []

            if (driver.company_id) {
                // Get pending requests from transport_requests
                const { data: pendingData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('status', 'pending')

                // Get pending transport_bookings from clinics for this company
                // SELECT urgency, patient(patient_id)
                const { data: pendingBookings } = await supabase
                    .from('transport_bookings')
                    .select(`
                        *,
                        patient:patients(name, patient_id),
                        clinic:clinics(name, location_name)
                    `)
                    .eq('company_id', driver.company_id)
                    .eq('booking_status', 'pending')
                    .order('created_at', { ascending: false })

                // Format bookings to match request structure
                const formattedBookings = (pendingBookings || []).map(b => ({
                    id: b.id,
                    status: 'pending',
                    severity_level: b.urgency || b.urgency_level || 'routine', // Check both columns
                    pickup_address: b.pickup_location,
                    destination_address: b.destination_location,
                    created_at: b.created_at,
                    isBooking: true, // Flag to distinguish
                    patient_name: b.patient?.name,
                    patient_id: b.patient?.patient_id, // Pass the human-readable ID
                    clinic_name: b.clinic?.name
                }))

                pendingReqs = [...(pendingData || []), ...formattedBookings]
            }

            setStats({
                tripsToday: tripsToday || 0,
                totalTrips: totalTrips || 0,
                activeTrip: activeTrip || null,
                pendingRequests: pendingReqs
            })
        } catch (error) {
            console.error('Error loading stats:', error)
        }
    }

    const handleAcceptRequest = async (request) => {
        try {
            setIsSyncing(true)

            let requestIdToUse = request.id;

            // IF IT'S A BOOKING (from Clinical Portal), we must first create a transport_request
            // because transport_assignments table requires a valid request_id foreign key.
            if (request.isBooking) {
                // Map booking fields (location) to request fields (address)
                const { data: newRequest, error: reqError } = await supabase
                    .from('transport_requests')
                    .insert({
                        patient_id: null, // Optional, or map if available
                        // MAPPING REQUIRED FIELDS FROM SCHEMA
                        pickup_address: request.pickup_address,
                        destination_address: request.destination_address,

                        // NON-NULLABLE GEO FIELDS (Use 0 as fallback if missing, or actual values)
                        pickup_latitude: request.pickup_latitude || 0,
                        pickup_longitude: request.pickup_longitude || 0,
                        destination_latitude: request.destination_latitude || 0,
                        destination_longitude: request.destination_longitude || 0,

                        // NON-NULLABLE ENUMS/TEXT
                        patient_reference_id: request.patient_id || 'UNKNOWN',

                        // Map 'routine' to 'non_urgent' to satisfy severity_enum ('critical', 'urgent', 'stable', 'non_urgent')
                        severity_level: (() => {
                            const val = (request.severity_level || 'non_urgent').toLowerCase();
                            if (val === 'routine' || val === 'low' || val === 'non_urgent') return 'non_urgent';
                            if (val === 'medium' || val === 'stable') return 'stable'; // OR 'urgent' depending on preference. mapping medium -> stable.
                            if (val === 'urgent' || val === 'high') return 'urgent';
                            if (val === 'critical' || val === 'emergency') return 'critical';
                            return 'non_urgent'; // Fallback
                        })(),

                        // Map vehicle type if needed, strict enum: 'helicopter', 'ambulance', 'boat', 'land_ambulance', 'other'
                        required_transport_type: 'ambulance', // Default for now, ideally map from request.recommended_vehicle_type

                        status: 'assigned'
                        // removed invalid fields: urgency_level, requested_by, notes
                    })
                    .select()
                    .single();

                if (reqError) {
                    console.error('Failed to create intermediate request:', reqError);
                    throw new Error('Could not process booking. Database schema mismatch or constraint failed.');
                }

                requestIdToUse = newRequest.id;
            }

            // 1. Create a new assignment
            const { data: assignment, error: assignmentError } = await supabase
                .from('transport_assignments')
                .insert({
                    driver_id: driver.id,
                    company_id: driver.company_id,
                    vehicle_id: driver.current_vehicle_id, // Assuming driver has a vehicle assigned
                    current_status: 'accepted',
                    accepted_at: new Date().toISOString(),
                    // Link to the request/booking (now guaranteed to be a valid request_id)
                    request_id: requestIdToUse,
                    transport_booking_id: request.isBooking ? request.id : null
                })
                .select()
                .single()

            if (assignmentError) throw assignmentError

            // 2. Update the source status
            if (request.isBooking) {
                // Update the original booking too
                await supabase
                    .from('transport_bookings')
                    .update({
                        booking_status: 'driver_assigned',
                        driver_id: driver.id
                    })
                    .eq('id', request.id)
            } else {
                // If it was already a request, we update it (though we set status 'assigned' above for new ones)
                await supabase
                    .from('transport_requests')
                    .update({ status: 'assigned' })
                    .eq('id', request.id)
            }

            // 3. Refresh
            await loadStats()
            // Navigate to trip view
            if (assignment) {
                navigate(`/trip/${assignment.id}`)
            }

        } catch (error) {
            console.error('Error accepting request:', error)
            alert('Failed to accept request. It may have been taken by another driver.')
        } finally {
            setIsSyncing(false)
        }
    }

    const toggleStatus = async () => {
        // Debounce: prevent updates while a request is actively flying
        if (isSyncing) return

        const oldStatus = optimisticStatus
        const newStatus = oldStatus === 'available' ? 'off_duty' : 'available'

        // 1. INSTANTLY update UI
        setOptimisticStatus(newStatus)
        setIsSyncing(true)

        try {
            // 2. Perform background update
            const { error } = await supabase
                .from('drivers')
                .update({ current_status: newStatus })
                .eq('id', driver.id)

            if (error) throw error

            // 3. Trigger global refresh (silent)
            onUpdate(driver.user_id).catch(console.error)

        } catch (error) {
            console.error('Status sync failed:', error)
            // Revert UI on failure
            setOptimisticStatus(oldStatus)
            alert('Failed to update status. Please check your connection.')
        } finally {
            // Allow next click after short delay
            setTimeout(() => setIsSyncing(false), 500)
        }
    }

    const getStatusBadge = () => {
        const badges = {
            available: { class: 'status-available', text: 'Available for Requests' },
            on_trip: { class: 'status-on-trip', text: 'On Active Trip' },
            off_duty: { class: 'status-off-duty', text: 'Off Duty' }
        }
        // Use optimistic status for badge
        return badges[optimisticStatus] || badges.off_duty
    }

    const statusBadge = getStatusBadge()

    return (
        <div className="driver-dashboard">
            <header className="driver-header">
                <div className="driver-profile">
                    <div className="driver-avatar">
                        {driver.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h2>{driver.full_name}</h2>
                        <p className="vehicle-info">{driver.vehicles?.vehicle_name || 'No vehicle assigned'}</p>
                    </div>
                </div>
                <button className="btn-signout" onClick={signOut}>
                    <LogOut size={20} />
                </button>
            </header>

            <div className="status-card">
                <div className="status-indicator">
                    <div className={`status-dot ${statusBadge.class}`}></div>
                    <span className="status-text">{statusBadge.text}</span>
                </div>
                <button
                    className={`btn-toggle-status ${optimisticStatus === 'available' ? 'btn-danger' : 'btn-success'}`}
                    onClick={toggleStatus}
                    disabled={isSyncing || optimisticStatus === 'on_trip'}
                    style={{ opacity: isSyncing ? 0.7 : 1, transition: 'all 0.2s' }}
                >
                    {optimisticStatus === 'available' ? 'Go Off Duty' : 'Go On Duty'}
                </button>
            </div>

            {stats.activeTrip && (
                <div className="active-trip-banner">
                    <Bell size={24} />
                    <div className="flex-1">
                        <h3>Active Trip in Progress</h3>
                        <p>Status: {stats.activeTrip.current_status.replace(/_/g, ' ')}</p>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => navigate(`/trip/${stats.activeTrip.id}`)}
                    >
                        View Details
                    </button>
                </div>
            )}

            {/* Available Requests Section */}
            {driver.current_status === 'available' && (
                <div className="available-requests-section">
                    <h3>Available Requests</h3>
                    {stats.pendingRequests.length === 0 ? (
                        <div className="empty-requests">
                            <p>No new requests at the moment</p>
                        </div>
                    ) : (
                        <div className="requests-list">
                            {stats.pendingRequests.map(request => (
                                <div key={request.id} className="request-card">
                                    <div className="request-header">
                                        <span className={`badge badge-${request.severity_level === 'critical' ? 'danger' : 'warning'}`}>
                                            {request.severity_level}
                                        </span>
                                        <span className="request-time">
                                            {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="request-details">
                                        <div className="location-row">
                                            <div className="location-dot pickup"></div>
                                            <p>{request.pickup_address}</p>
                                        </div>
                                        <div className="location-line"></div>
                                        <div className="location-row">
                                            <div className="location-dot dropoff"></div>
                                            <p>{request.destination_address}</p>
                                        </div>
                                    </div>
                                    <div className="request-actions">
                                        <button
                                            className="btn-accept"
                                            onClick={() => handleAcceptRequest(request)}
                                            disabled={isSyncing}
                                        >
                                            Accept Request
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="stats-grid">
                <div className="stat-box">
                    <Clock size={32} />
                    <div>
                        <h3>{stats.tripsToday}</h3>
                        <p>Trips Today</p>
                    </div>
                </div>
                <div className="stat-box">
                    <MapPin size={32} />
                    <div>
                        <h3>{stats.totalTrips}</h3>
                        <p>Total Trips</p>
                    </div>
                </div>
            </div>

            <div className="info-section">
                <h3>How It Works</h3>
                <div className="info-list">
                    <div className="info-item">
                        <div className="info-number">1</div>
                        <div>
                            <h4>Stay Available</h4>
                            <p>Keep your status "Available" to receive emergency requests</p>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-number">2</div>
                        <div>
                            <h4>Get Notified</h4>
                            <p>You'll receive a popup when there's a nearby emergency</p>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-number">3</div>
                        <div>
                            <h4>Accept & Navigate</h4>
                            <p>Accept the request and follow the trip updates</p>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-number">4</div>
                        <div>
                            <h4>Complete Delivery</h4>
                            <p>Update status at each stage until patient is delivered</p>
                        </div>
                    </div>
                </div>
            </div>

            {driver.current_status === 'off_duty' && (
                <div className="duty-reminder">
                    <Bell size={20} />
                    <p>You're currently off duty. Go on duty to start receiving emergency requests.</p>
                </div>
            )}
        </div>
    )
}
