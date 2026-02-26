import express from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================================================================
// HELPER: Haversine distance (km) between two lat/lng points
// ============================================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================================
// HELPER: ETA in minutes (conservative 40 km/h island road speed)
// ============================================================================
function estimateETA(distanceKm, speedKmh = 40) {
    if (distanceKm <= 0) return 0;
    return Math.round((distanceKm / speedKmh) * 60);
}

// ============================================================================
// PUT /api/location/clinic — Save clinic coordinates
// ============================================================================
router.put('/clinic', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (latitude == null || longitude == null) {
            return res.status(400).json({ error: 'latitude and longitude are required' });
        }

        if (!req.clinicId) {
            return res.status(403).json({ error: 'No clinic associated with this account' });
        }

        const { data, error } = await supabase
            .from('clinics')
            .update({
                latitude,
                longitude,
                location_updated_at: new Date().toISOString()
            })
            .eq('id', req.clinicId)
            .select('id, latitude, longitude, location_updated_at')
            .single();

        if (error) throw error;

        console.log(`[Location] Clinic ${req.clinicId} coordinates saved: ${latitude}, ${longitude}`);
        res.json({ data });
    } catch (err) {
        console.error('PUT /location/clinic error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// PUT /api/location/hospital — Save hospital coordinates
// ============================================================================
router.put('/hospital', authMiddleware, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (latitude == null || longitude == null) {
            return res.status(400).json({ error: 'latitude and longitude are required' });
        }

        // Find the hospital this user administers
        const { data: hospital, error: findErr } = await supabase
            .from('hospitals')
            .select('id')
            .eq('admin_id', req.user.id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (!hospital) {
            return res.status(403).json({ error: 'No hospital associated with this account' });
        }

        const { data, error } = await supabase
            .from('hospitals')
            .update({
                latitude,
                longitude,
                location_updated_at: new Date().toISOString()
            })
            .eq('id', hospital.id)
            .select('id, latitude, longitude, location_updated_at')
            .single();

        if (error) throw error;

        console.log(`[Location] Hospital ${hospital.id} coordinates saved: ${latitude}, ${longitude}`);
        res.json({ data });
    } catch (err) {
        console.error('PUT /location/hospital error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// POST /api/location/driver/ping — Driver GPS ping (UPSERT)
// ============================================================================
router.post('/driver/ping', authMiddleware, async (req, res) => {
    try {
        const { booking_id, latitude, longitude, heading, speed_kmh } = req.body;

        if (!booking_id || latitude == null || longitude == null) {
            return res.status(400).json({ error: 'booking_id, latitude, and longitude are required' });
        }

        // Verify the driver is assigned to this booking
        const { data: assignment, error: assignErr } = await supabase
            .from('transport_assignments')
            .select('id, driver_id')
            .eq('id', booking_id)
            .in('current_status', ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital'])
            .single();

        if (assignErr || !assignment) {
            return res.status(403).json({ error: 'No active assignment found for this booking' });
        }

        // Get the actual driver profile ID (auth ID != driver ID)
        const { data: driverProfile, error: driverErr } = await supabase
            .from('drivers')
            .select('id')
            .eq('user_id', req.user.id)
            .single();

        if (driverErr || !driverProfile) {
            return res.status(403).json({ error: 'Driver profile not found' });
        }

        // UPSERT the driver location (one row per booking+driver)
        const { data, error } = await supabase
            .from('driver_locations')
            .upsert({
                booking_id,
                driver_id: driverProfile.id,
                latitude,
                longitude,
                heading: heading || null,
                speed_kmh: speed_kmh || null,
                recorded_at: new Date().toISOString()
            }, { onConflict: 'booking_id,driver_id' })
            .select()
            .single();

        if (error) throw error;

        // Emit Socket.io event to the booking room
        const payload = {
            bookingId: booking_id,
            driverLat: latitude,
            driverLng: longitude,
            heading: heading || null,
            speed: speed_kmh || null,
            timestamp: new Date().toISOString()
        };

        req.io?.to(`booking:${booking_id}`).emit('driver:location_update', payload);
        req.io?.to('admin:live_map').emit('driver:location_update', {
            ...payload,
            driverId: driverProfile.id
        });

        res.json({ data });
    } catch (err) {
        console.error('POST /location/driver/ping error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// GET /api/location/booking/:bookingId — Full map data for a booking
// ============================================================================
// ============================================================================
// GET /api/location/booking/:bookingId — Full map data for a booking
// ============================================================================
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
    try {
        const { bookingId } = req.params;

        // 1. Get driver location
        const { data: driverLocation } = await supabase
            .from('driver_locations')
            .select('*')
            .eq('booking_id', bookingId)
            .maybeSingle();

        // 2. Get the assignment first to find the correct booking ID
        const { data: assignment, error: assignErr } = await supabase
            .from('transport_assignments')
            .select('*')
            .eq('id', bookingId)
            .maybeSingle();

        if (assignErr) throw assignErr;
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        // Determine the effective booking ID
        // Migration added transport_booking_id, but older records might use booking_id
        const effectiveBookingId = assignment.transport_booking_id || assignment.booking_id;

        let booking = null;
        let clinic = null;

        if (effectiveBookingId) {
            // 3. Fetch full booking details with clinic join
            const { data: bookingData } = await supabase
                .from('transport_bookings')
                .select(`
                    *,
                    patient:patients(*),
                    clinic:clinics!clinic_id(id, name, latitude, longitude)
                `)
                .eq('id', effectiveBookingId)
                .maybeSingle();

            if (bookingData) {
                booking = bookingData;
                clinic = bookingData.clinic;
            }
        }

        // Pickup: prefer clinic coordinates, fall back to booking columns
        const pickup = {
            name: clinic?.name || booking?.pickup_location || null,
            latitude: clinic?.latitude || booking?.pickup_latitude || null,
            longitude: clinic?.longitude || booking?.pickup_longitude || null
        };

        // Destination: look up hospital by name since there's no direct hospital_id FK
        let hospital = null;
        if (booking?.destination_location) {
            // 1. Try exact/partial match
            const { data: hospitalData } = await supabase
                .from('hospitals')
                .select('id, name, latitude, longitude')
                .ilike('name', `%${booking.destination_location}%`)
                .limit(1)
                .maybeSingle();

            hospital = hospitalData;

            // 2. Fallback: If destination is just "hospital" (generic) and we found nothing,
            // default to the first active hospital (Common in demo/testing scenarios)
            if (!hospital && booking.destination_location.toLowerCase().includes('hospital')) {
                const { data: anyHospital } = await supabase
                    .from('hospitals')
                    .select('id, name, latitude, longitude')
                    .limit(1)
                    .maybeSingle();
                hospital = anyHospital;
            }
        }

        const dropoff = {
            name: hospital?.name || booking?.destination_location || null,
            latitude: hospital?.latitude || booking?.destination_latitude || null,
            longitude: hospital?.longitude || booking?.destination_longitude || null
        };

        // Calculate ETA if driver location and dropoff coordinates exist
        let eta = null;
        if (driverLocation && dropoff.latitude && dropoff.longitude) {
            const distance = haversineDistance(
                driverLocation.latitude, driverLocation.longitude,
                dropoff.latitude, dropoff.longitude
            );
            eta = {
                distanceKm: Math.round(distance * 10) / 10,
                minutesRemaining: estimateETA(distance),
                calculatedAt: new Date().toISOString()
            };
        }

        res.json({
            driver: driverLocation ? {
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
                heading: driverLocation.heading,
                speed_kmh: driverLocation.speed_kmh,
                recorded_at: driverLocation.recorded_at
            } : null,
            pickup: pickup.latitude ? pickup : null,
            dropoff: dropoff.latitude ? dropoff : null,
            assignment: {
                id: assignment.id,
                status: assignment.current_status
            },
            eta
        });
    } catch (err) {
        console.error('GET /location/booking error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// GET /api/location/active-drivers — All active driver locations (Admin only)
// ============================================================================
router.get('/active-drivers', authMiddleware, async (req, res) => {
    try {
        // Verify admin role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .single();

        if (profile) {
            console.log(`[Location] /active-drivers access check. User: ${req.user.id}, Role: ${profile.role}`);
        } else {
            console.warn(`[Location] /active-drivers access check. User: ${req.user.id}, NO PROFILE FOUND`);
        }

        if (profile?.role !== 'admin' && profile?.role !== 'hospital_admin' && profile?.role !== 'hospital') {
            console.warn(`[Location] /active-drivers ACCESS DENIED. Role: ${profile?.role}`);
            return res.status(403).json({ error: 'Admin or Hospital access required' });
        }

        // Get all active assignments with driver locations
        const { data: activeAssignments, error } = await supabase
            .from('transport_assignments')
            .select(`
                id,
                current_status,
                driver_id,
                drivers:driver_id (id, full_name),
                transport_booking_id,
                transport_bookings:transport_booking_id (
                    pickup_location,
                    destination_location,
                    clinic_id,
                    clinics:clinic_id (name, latitude, longitude),
                    hospital_id,
                    hospitals:hospital_id (name, latitude, longitude)
                )
            `)
            .in('current_status', ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital']);

        if (error) throw error;

        // For each active assignment, get the driver location
        const results = [];
        for (const assignment of (activeAssignments || [])) {
            const { data: loc } = await supabase
                .from('driver_locations')
                .select('latitude, longitude, heading, speed_kmh, recorded_at')
                .eq('booking_id', assignment.id)
                .maybeSingle();

            const booking = assignment.transport_bookings;
            const hospital = booking?.hospitals;

            let eta = null;
            if (loc && hospital?.latitude && hospital?.longitude) {
                const distance = haversineDistance(loc.latitude, loc.longitude, hospital.latitude, hospital.longitude);
                eta = {
                    distanceKm: Math.round(distance * 10) / 10,
                    minutesRemaining: estimateETA(distance)
                };
            }

            results.push({
                assignmentId: assignment.id,
                status: assignment.current_status,
                driver: {
                    id: assignment.driver_id,
                    name: assignment.drivers?.full_name || 'Unknown',
                    location: loc || null
                },
                pickup: booking?.clinics ? {
                    name: booking.clinics.name,
                    latitude: booking.clinics.latitude,
                    longitude: booking.clinics.longitude
                } : { name: booking?.pickup_location },
                dropoff: booking?.hospitals ? {
                    name: booking.hospitals.name,
                    latitude: booking.hospitals.latitude,
                    longitude: booking.hospitals.longitude
                } : { name: booking?.destination_location },
                eta
            });
        }

        res.json({ drivers: results, count: results.length });
    } catch (err) {
        console.error('GET /location/active-drivers error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
