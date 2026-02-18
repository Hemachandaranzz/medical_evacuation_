import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { MapPin, Navigation, AlertCircle, CheckCircle, ArrowLeft, Clock, User, Map } from 'lucide-react'
import { formatDateTime, calculateDistance } from '../../lib/utils'
import MapView from './MapView'
import './ActiveTrip.css'

export default function ActiveTrip({ driver }) {
    const { tripId } = useParams()
    const navigate = useNavigate()
    const [assignment, setAssignment] = useState(null)
    const [request, setRequest] = useState(null)
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [showMap, setShowMap] = useState(false)

    useEffect(() => {
        loadTrip()

        // Subscribe to real-time updates
        const subscription = supabase
            .channel(`trip-${tripId}`)
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'transport_assignments',
                    filter: `id=eq.${tripId}`
                },
                (payload) => {
                    setAssignment(payload.new)
                }
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [tripId])

    const loadTrip = async () => {
        try {
            const { data: assignmentData, error: assignmentError } = await supabase
                .from('transport_assignments')
                .select('*')
                .eq('id', tripId)
                .single()

            if (assignmentError) throw assignmentError
            setAssignment(assignmentData)

            let requestData = null

            let pickupLat = null
            let pickupLng = null
            let destLat = null
            let destLng = null
            let pickupAddress = ''
            let destinationAddress = ''
            let patientRef = ''
            let severity = 'routine'
            let createdAt = ''
            let requestId = ''

            // Handle request linked via request_id (Legacy/API)
            if (assignmentData.request_id) {
                const { data, error } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('id', assignmentData.request_id)
                    .single()

                if (error) throw error

                // Initial values from request table
                pickupLat = data.pickup_latitude
                pickupLng = data.pickup_longitude
                destLat = data.destination_latitude
                destLng = data.destination_longitude
                pickupAddress = data.pickup_address
                destinationAddress = data.destination_address
                patientRef = data.patient_reference_id
                severity = data.severity_level
                createdAt = data.created_at
                requestId = data.id
            }
            // Handle request linked via booking_id (Clinical Portal)
            else if (assignmentData.booking_id || assignmentData.transport_booking_id) {
                const bookingId = assignmentData.booking_id || assignmentData.transport_booking_id
                const { data, error } = await supabase
                    .from('transport_bookings')
                    .select(`*, patient:patients(*)`)
                    .eq('id', bookingId)
                    .single()

                if (error) throw error

                // Initial values from booking table
                pickupLat = data.pickup_latitude
                pickupLng = data.pickup_longitude
                destLat = data.destination_latitude
                destLng = data.destination_longitude
                pickupAddress = data.pickup_location
                destinationAddress = data.destination_location
                patientRef = data.patient?.patient_id || 'N/A'
                severity = data.urgency_level || data.urgency || 'routine'
                createdAt = data.created_at
                requestId = data.id
            } else {
                console.warn('Assignment has no request_id or booking_id')
            }

            // ALWAYS Fetch real coordinates from backend API (bypasses RLS, joins clinic/hospital tables)
            // This fixes issues where local tables have 0.0 or null coordinates
            try {
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
                const { data: { session } } = await supabase.auth.getSession()
                const token = session?.access_token

                console.log('Fetching location for trip:', tripId);
                const locRes = await fetch(`${API_URL}/location/booking/${tripId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })

                if (locRes.ok) {
                    const locData = await locRes.json()
                    console.log('Location API Response:', locData);

                    // Override if API provides valid coordinates
                    if (locData.pickup?.latitude && locData.pickup?.longitude) {
                        pickupLat = locData.pickup.latitude
                        pickupLng = locData.pickup.longitude
                    }
                    if (locData.dropoff?.latitude && locData.dropoff?.longitude) {
                        destLat = locData.dropoff.latitude
                        destLng = locData.dropoff.longitude
                    }

                    // Override Patient & Severity from Backend (Bypasses RLS)
                    if (locData.booking?.patient) {
                        patientRef = locData.booking.patient.patient_id || 'N/A'
                    }
                    if (locData.booking?.urgency || locData.booking?.urgency_level) {
                        severity = locData.booking.urgency || locData.booking.urgency_level
                    }
                } else {
                    console.error('Location API failed:', locRes.status, await locRes.text());
                }
            } catch (locErr) {
                console.error('Could not fetch location data from API:', locErr.message)
            }

            requestData = {
                id: requestId,
                patient_reference_id: patientRef,
                severity_level: severity,
                pickup_address: pickupAddress,
                pickup_latitude: pickupLat,
                pickup_longitude: pickupLng,
                destination_address: destinationAddress,
                destination_latitude: destLat,
                destination_longitude: destLng,
                created_at: createdAt
            }

            if (!requestData) throw new Error('No associated request or booking found')
            setRequest(requestData)


        } catch (error) {
            console.error('Error loading trip:', error)
            alert('Error loading trip details')
            navigate('/')
        } finally {
            setLoading(false)
        }
    }

    const updateStatus = async (newStatus) => {
        setUpdating(true)
        try {
            const updates = {
                current_status: newStatus
            }

            // Set timestamps based on status
            const now = new Date().toISOString()
            if (newStatus === 'en_route_pickup') {
                updates.pickup_started_at = now
            } else if (newStatus === 'patient_loaded') {
                updates.patient_loaded_at = now
            } else if (newStatus === 'en_route_hospital') {
                updates.delivery_started_at = now
            } else if (newStatus === 'delivered') {
                updates.completed_at = now
            }

            const { error } = await supabase
                .from('transport_assignments')
                .update(updates)
                .eq('id', tripId)

            if (error) throw error

            // SYNC TO CLINICAL PORTAL (Update transport_bookings if linked)
            if (assignment.booking_id) {
                let bookingStatusUpdate = null

                if (newStatus === 'delivered') {
                    bookingStatusUpdate = 'completed'
                } else if (['en_route_pickup', 'patient_loaded', 'en_route_hospital'].includes(newStatus)) {
                    bookingStatusUpdate = 'in_progress'
                }

                if (bookingStatusUpdate) {
                    await supabase
                        .from('transport_bookings')
                        .update({ booking_status: bookingStatusUpdate })
                        .eq('id', assignment.booking_id)
                }
            }

            // Update driver status
            if (newStatus === 'delivered') {
                await supabase
                    .from('drivers')
                    .update({ current_status: 'available' })
                    .eq('id', driver.id)

                alert('Trip completed! Status set to Available.')
                navigate('/')
            } else {
                await supabase
                    .from('drivers')
                    .update({ current_status: 'on_trip' })
                    .eq('id', driver.id)

                await loadTrip()
            }

        } catch (error) {
            console.error('Error updating status:', error)
            alert('Error updating status: ' + error.message)
        } finally {
            setUpdating(false)
        }
    }

    const getNextAction = () => {
        const actions = {
            accepted: {
                label: 'Start Going to Pickup',
                status: 'en_route_pickup',
                icon: Navigation,
                color: 'primary'
            },
            en_route_pickup: {
                label: 'Patient Loaded',
                status: 'patient_loaded',
                icon: CheckCircle,
                color: 'success'
            },
            patient_loaded: {
                label: 'Start Going to Hospital',
                status: 'en_route_hospital',
                icon: Navigation,
                color: 'primary'
            },
            en_route_hospital: {
                label: 'Mark as Delivered',
                status: 'delivered',
                icon: CheckCircle,
                color: 'success'
            }
        }
        return actions[assignment?.current_status]
    }

    if (loading || !assignment || !request) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        )
    }

    const nextAction = getNextAction()
    const distance = calculateDistance(
        request.pickup_latitude,
        request.pickup_longitude,
        request.destination_latitude,
        request.destination_longitude
    )

    if (showMap) {
        return <MapView assignment={assignment} driver={driver} onClose={() => setShowMap(false)} />
    }

    return (
        <div className="active-trip-page">
            <header className="trip-header">
                <button className="btn-back" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2>Active Trip</h2>
                    <p>Trip #{assignment.id.slice(0, 8)}</p>
                </div>
                <button className="btn-map-toggle" onClick={() => setShowMap(true)}>
                    <Map size={18} />
                    Map
                </button>
            </header>

            <div className="trip-status-banner">
                <AlertCircle size={24} />
                <div className="flex-1">
                    <h3>Current Status</h3>
                    <p>{assignment.current_status.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
            </div>

            <div className="trip-details">
                <div className="detail-section">
                    <h3>Patient Information</h3>
                    <div className="info-grid">
                        <div className="info-item">
                            <User size={16} />
                            <div>
                                <span className="label">Patient ID</span>
                                <span className="value">{request.patient_reference_id}</span>
                            </div>
                        </div>
                        <div className="info-item">
                            <AlertCircle size={16} />
                            <div>
                                <span className="label">Severity</span>
                                <span className="value severity-badge"
                                    style={(() => {
                                        const level = (request.severity_level || 'non_urgent').toLowerCase();
                                        if (level === 'critical' || level === 'emergency') return { backgroundColor: '#fee2e2', color: '#991b1b' }; // Red
                                        if (level === 'urgent' || level === 'high') return { backgroundColor: '#ffedd5', color: '#9a3412' }; // Orange
                                        if (level === 'stable' || level === 'medium') return { backgroundColor: '#d1fae5', color: '#065f46' }; // Green
                                        return { backgroundColor: '#dbeafe', color: '#1e40af' }; // Blue (Non-urgent/Routine)
                                    })()}
                                >
                                    {(request.severity_level || 'UNKNOWN').toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <h3>Pickup Location</h3>
                    <div className="location-card">
                        <MapPin size={20} />
                        <div>
                            <p className="location-address">{request.pickup_address}</p>
                            {request.pickup_latitude && request.pickup_longitude ? (
                                <p className="location-coords" style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>
                                    📍 {Number(request.pickup_latitude).toFixed(6)}, {Number(request.pickup_longitude).toFixed(6)}
                                </p>
                            ) : (
                                <p className="location-coords" style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                                    ⚠️ Clinic coordinates not set — navigating by address
                                </p>
                            )}
                            <button className="btn-navigate" onClick={() => {
                                const hasCoords = request.pickup_latitude && request.pickup_longitude &&
                                    request.pickup_latitude !== 0 && request.pickup_longitude !== 0;
                                const destination = hasCoords
                                    ? `${request.pickup_latitude},${request.pickup_longitude}`
                                    : encodeURIComponent(request.pickup_address);
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank')
                            }}>
                                <Navigation size={16} />
                                Navigate
                            </button>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <h3>Destination</h3>
                    <div className="location-card">
                        <MapPin size={20} />
                        <div>
                            <p className="location-address">{request.destination_address}</p>
                            {request.destination_latitude && request.destination_longitude ? (
                                <p className="location-coords" style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>
                                    📍 {Number(request.destination_latitude).toFixed(6)}, {Number(request.destination_longitude).toFixed(6)}
                                </p>
                            ) : (
                                <p className="location-coords" style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                                    ⚠️ Hospital coordinates not set — navigating by address
                                </p>
                            )}
                            <p className="distance-info">~{distance.toFixed(1)} km from pickup</p>
                            <button className="btn-navigate" onClick={() => {
                                const hasCoords = request.destination_latitude && request.destination_longitude &&
                                    request.destination_latitude !== 0 && request.destination_longitude !== 0;
                                const destination = hasCoords
                                    ? `${request.destination_latitude},${request.destination_longitude}`
                                    : encodeURIComponent(request.destination_address);
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank')
                            }}>
                                <Navigation size={16} />
                                Navigate
                            </button>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <h3>Trip Timeline</h3>
                    <div className="timeline">
                        <div className={`timeline-item ${assignment.accepted_at ? 'completed' : ''}`}>
                            <div className="timeline-icon">
                                <CheckCircle size={20} />
                            </div>
                            <div>
                                <p className="timeline-label">Accepted</p>
                                {assignment.accepted_at && (
                                    <p className="timeline-time">{formatDateTime(assignment.accepted_at)}</p>
                                )}
                            </div>
                        </div>

                        <div className={`timeline-item ${assignment.pickup_started_at ? 'completed' : assignment.current_status === 'en_route_pickup' ? 'active' : ''}`}>
                            <div className="timeline-icon">
                                <Navigation size={20} />
                            </div>
                            <div>
                                <p className="timeline-label">En Route to Pickup</p>
                                {assignment.pickup_started_at && (
                                    <p className="timeline-time">{formatDateTime(assignment.pickup_started_at)}</p>
                                )}
                            </div>
                        </div>

                        <div className={`timeline-item ${assignment.patient_loaded_at ? 'completed' : assignment.current_status === 'patient_loaded' ? 'active' : ''}`}>
                            <div className="timeline-icon">
                                <User size={20} />
                            </div>
                            <div>
                                <p className="timeline-label">Patient Loaded</p>
                                {assignment.patient_loaded_at && (
                                    <p className="timeline-time">{formatDateTime(assignment.patient_loaded_at)}</p>
                                )}
                            </div>
                        </div>

                        <div className={`timeline-item ${assignment.delivery_started_at ? 'completed' : assignment.current_status === 'en_route_hospital' ? 'active' : ''}`}>
                            <div className="timeline-icon">
                                <Navigation size={20} />
                            </div>
                            <div>
                                <p className="timeline-label">En Route to Hospital</p>
                                {assignment.delivery_started_at && (
                                    <p className="timeline-time">{formatDateTime(assignment.delivery_started_at)}</p>
                                )}
                            </div>
                        </div>

                        <div className={`timeline-item ${assignment.completed_at ? 'completed' : assignment.current_status === 'delivered' ? 'active' : ''}`}>
                            <div className="timeline-icon">
                                <CheckCircle size={20} />
                            </div>
                            <div>
                                <p className="timeline-label">Delivered</p>
                                {assignment.completed_at && (
                                    <p className="timeline-time">{formatDateTime(assignment.completed_at)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {nextAction && (
                <div className="trip-actions">
                    <button
                        className={`btn-${nextAction.color} btn-full btn-lg`}
                        onClick={() => updateStatus(nextAction.status)}
                        disabled={updating}
                    >
                        {updating ? (
                            'Updating...'
                        ) : (
                            <>
                                {React.createElement(nextAction.icon, { size: 20 })}
                                {nextAction.label}
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}
