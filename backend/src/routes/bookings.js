import express from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware, clinicAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================================================================
// VEHICLE RECOMMENDATION ALGORITHM
// ============================================================================

/**
 * Recommends the most suitable vehicle based on patient risk score
 * @param {number} riskScore - Patient risk score (0-100)
 * @param {Array} availableVehicles - List of available vehicles
 * @returns {Object} Recommended vehicle and type
 */
function recommendVehicle(riskScore, availableVehicles) {
    if (!availableVehicles || availableVehicles.length === 0) {
        return { vehicle: null, recommendedType: null };
    }

    let recommendedType;

    if (riskScore >= 80) {
        // Critical - prioritize helicopter for fastest transport
        recommendedType = 'helicopter';
    } else if (riskScore >= 60) {
        // High risk - ambulance or helicopter
        recommendedType = 'ambulance';
    } else if (riskScore >= 30) {
        // Moderate - ambulance or ship
        recommendedType = 'ambulance';
    } else {
        // Low risk - any available vehicle
        recommendedType = 'ship';
    }

    // Try to find exact match
    let vehicle = availableVehicles.find(v => v.vehicle_type === recommendedType);

    // Fallback priority: helicopter > ambulance > ship > boat
    if (!vehicle) {
        const priority = ['helicopter', 'ambulance', 'ship', 'boat'];
        for (const type of priority) {
            vehicle = availableVehicles.find(v => v.vehicle_type === type);
            if (vehicle) {
                recommendedType = type;
                break;
            }
        }
    }

    return { vehicle, recommendedType };
}


// ============================================================================
// REGION MAPPING HELPER
// ============================================================================

/**
 * Returns all location values that belong to the same region group
 * This enables clinics in any island to find providers serving that region
 */
function getRelatedLocations(location) {
    if (!location) return [location];

    const normalized = location.trim().toLowerCase();

    // Define region groups - all locations that should match together
    const andamanLocations = ['Andaman & Nicobar', 'Andaman', 'Port Blair', 'Havelock Island', 'Neil Island', 'Little Andaman'];
    const nicobarLocations = ['Nicobar', 'Car Nicobar', 'Great Nicobar'];
    const lakshadweepLocations = ['Lakshadweep', 'Kavaratti', 'Agatti', 'Minicoy', 'Amini', 'Kadmat', 'Kalpeni', 'Andrott'];

    // Check which group this location belongs to
    if (andamanLocations.some(loc => loc.toLowerCase() === normalized || normalized.includes(loc.toLowerCase()) || loc.toLowerCase().includes(normalized))) {
        return andamanLocations;
    }
    if (nicobarLocations.some(loc => loc.toLowerCase() === normalized)) {
        return nicobarLocations;
    }
    if (lakshadweepLocations.some(loc => loc.toLowerCase() === normalized)) {
        return lakshadweepLocations;
    }

    // Return original if no group match
    return [location];
}

// ============================================================================
// GET AVAILABLE TRANSPORT PROVIDERS BY REGION
// ============================================================================

router.get('/available', authMiddleware, async (req, res) => {
    try {
        const { region } = req.query;

        if (!region) {
            return res.status(400).json({ error: 'Region parameter is required' });
        }

        // Get all related locations for this region group
        const relatedLocations = getRelatedLocations(region);

        console.log(`[GET /bookings/available] Region: "${region}", Related locations:`, relatedLocations);

        // Get active and verified transport companies in ANY of the related locations
        const { data: companies, error: companiesError } = await supabase
            .from('transport_companies')
            .select(`
                id,
                company_name,
                contact_email,
                contact_phone,
                operating_location,
                is_verified,
                is_active
            `)
            .in('operating_location', relatedLocations)
            .eq('is_verified', true)
            .eq('is_active', true)
            .order('company_name');

        console.log(`[GET /bookings/available] Query filters:`, {
            operating_location_in: relatedLocations,
            is_verified: true,
            is_active: true
        });
        console.log(`[GET /bookings/available] Companies found:`, companies?.length || 0);
        if (companies && companies.length > 0) {
            console.log(`[GET /bookings/available] Company details:`, companies.map(c => ({
                name: c.company_name,
                location: c.operating_location,
                verified: c.is_verified,
                active: c.is_active
            })));
        }

        if (companiesError) {
            console.error('[GET /bookings/available] Database error:', companiesError);
            throw companiesError;
        }

        // Get vehicle and driver counts for each company
        const companiesWithStats = await Promise.all(
            (companies || []).map(async (company) => {
                const { count: vehicleCount } = await supabase
                    .from('vehicles')
                    .select('*', { count: 'exact', head: true })
                    .eq('company_id', company.id);

                const { count: driverCount } = await supabase
                    .from('drivers')
                    .select('*', { count: 'exact', head: true })
                    .eq('company_id', company.id)
                    .eq('current_status', 'available');

                return {
                    ...company,
                    available_vehicles: vehicleCount || 0,
                    available_drivers: driverCount || 0
                };
            })
        );

        res.json({
            data: companiesWithStats,
            count: companiesWithStats.length
        });
    } catch (error) {
        console.error('Get available providers error:', error);
        res.status(500).json({ error: 'Failed to fetch available providers' });
    }
});

// ============================================================================
// GET BOOKINGS LIST (for transport providers)
// ============================================================================

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status } = req.query;

        // Get company_id from authenticated user
        const userId = req.user?.id || req.userId;
        console.log(`[GET /bookings] Fetching bookings for user: ${userId}`);

        // Find the company for this user
        const { data: company } = await supabase
            .from('transport_companies')
            .select('id')
            .eq('admin_id', userId)
            .single();

        if (!company) {
            console.log('[GET /bookings] Company not found for user');
            return res.json({ data: [], count: 0 });
        }

        console.log(`[GET /bookings] Found company: ${company.id}`);

        // Build query for bookings
        let query = supabase
            .from('transport_bookings')
            .select(`
                *,
                patient:patients(id, name, patient_id, risk_score),
                clinic:clinics(id, name, operating_location, contact_phone),
                vehicle:vehicles(id, vehicle_name, vehicle_type),
                driver:drivers(id, full_name, phone_number, current_status)
            `)
            .eq('company_id', company.id)
            .order('created_at', { ascending: false });

        // Filter by status if provided
        if (status && status !== 'all') {
            query = query.eq('booking_status', status);
        }

        const { data: bookings, error } = await query;

        if (error) {
            console.error('[GET /bookings] Error:', error);
            throw error;
        }

        console.log(`[GET /bookings] Found ${bookings?.length || 0} bookings`);
        res.json({ data: bookings || [], count: bookings?.length || 0 });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// ============================================================================
// GET CLINIC BOOKINGS (for clinical portal)
// ============================================================================

router.get('/clinic', clinicAuth, async (req, res) => {
    try {
        const clinicId = req.clinicId;
        console.log(`[GET /bookings/clinic] Fetching bookings for clinic: ${clinicId}`);

        // 1. Fetch bookings without assignments join
        const { data: bookings, error } = await supabase
            .from('transport_bookings')
            .select(`
                *,
                patient:patients(id, name, patient_id, risk_score),
                company:transport_companies(id, company_name, contact_phone),
                vehicle:vehicles(id, vehicle_name, vehicle_type)
            `)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[GET /bookings/clinic] Error:', error);
            throw error;
        }

        // 2. Manual Join: Fetch assignments for these bookings
        if (bookings && bookings.length > 0) {
            // Strategy: Link via driver_id because transport_bookings and transport_assignments
            // don't share a direct ID, but they share a driver when active.
            const driverIds = bookings
                .filter(b => b.driver_id)
                .map(b => b.driver_id);

            console.log(`[GET /bookings/clinic] Checking assignments for drivers:`, driverIds);

            let assignments = [];

            if (driverIds.length > 0) {
                const { data: activeAssignments, error: assignmentsError } = await supabase
                    .from('transport_assignments')
                    .select(`
                        *,
                        driver:drivers(full_name)
                    `)
                    .in('driver_id', driverIds)
                    .not('current_status', 'in', '(delivered,cancelled)'); // Only active assignments (exclude final states)

                if (assignmentsError) {
                    console.error('[GET /bookings/clinic] Assignments Error:', assignmentsError);
                } else {
                    assignments = activeAssignments || [];
                    console.log(`[GET /bookings/clinic] Found ${assignments.length} active assignments.`);
                }
            }

            // Merge assignments into bookings
            bookings.forEach(booking => {
                booking.assignments = [];

                if (booking.driver_id && assignments.length > 0) {
                    // Find assignment for this driver
                    // We prioritize exact match on transport_booking_id, falling back to driver_id for legacy data
                    const match = assignments.find(a => {
                        if (a.transport_booking_id) {
                            return a.transport_booking_id === booking.id;
                        }
                        // Legacy: Only match by driver_id if this assignment is NOT linked to another booking
                        return a.driver_id === booking.driver_id;
                    });

                    if (match) {
                        console.log(`[GET /bookings/clinic] Linking booking ${booking.id} to assignment ${match.id} (Status: ${match.current_status})`);
                        booking.assignments = [match];
                    }
                }
            });
        }

        console.log(`[GET /bookings/clinic] Found ${bookings?.length || 0} bookings`);
        res.json({ data: bookings || [] });
    } catch (error) {
        console.error('Get clinic bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// ============================================================================
// GET VEHICLES FOR A SPECIFIC COMPANY
// ============================================================================

router.get('/vehicles/:companyId', authMiddleware, async (req, res) => {
    try {
        const { companyId } = req.params;
        console.log(`[GET /vehicles] Fetching vehicles for company: ${companyId}`);

        // Get active vehicles for the company
        const { data: vehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('*')
            .eq('company_id', companyId)
            .order('vehicle_type');

        if (vehiclesError) {
            console.error('[GET /vehicles] Database error:', vehiclesError);
            throw vehiclesError;
        }

        console.log(`[GET /vehicles] Found ${vehicles?.length || 0} vehicles`);
        res.json({
            data: vehicles || [],
            count: (vehicles || []).length
        });
    } catch (error) {
        console.error('Get vehicles error:', error);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// ============================================================================
// CREATE TRANSPORT BOOKING
// ============================================================================

router.post('/', clinicAuth, async (req, res) => {
    try {
        const {
            patient_id,
            company_id,
            vehicle_id,
            pickup_location,
            destination_location,
            pickup_latitude,
            pickup_longitude,
            destination_latitude,
            destination_longitude,
            urgency,
            special_requirements,
            notes
        } = req.body;

        // Validate required fields
        if (!patient_id || !company_id || !vehicle_id || !pickup_location || !destination_location) {
            return res.status(400).json({
                error: 'Missing required fields: patient_id, company_id, vehicle_id, pickup_location, destination_location'
            });
        }

        // Verify patient belongs to clinic
        const { data: patient, error: patientError } = await supabase
            .from('patients')
            .select('clinic_id, risk_score')
            .eq('id', patient_id)
            .single();

        if (patientError || !patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        if (patient.clinic_id !== req.clinicId) {
            return res.status(403).json({ error: 'Unauthorized access to this patient' });
        }

        // Get available vehicles for recommendation
        const { data: vehicles } = await supabase
            .from('vehicles')
            .select('*')
            .eq('company_id', company_id);

        // Get vehicle recommendation
        const { recommendedType } = recommendVehicle(patient.risk_score || 50, vehicles || []);

        // Check if there's an existing evacuation request
        let evacuationId = null;
        const { data: existingEvacuation } = await supabase
            .from('evacuations')
            .select('id')
            .eq('patient_id', patient_id)
            .eq('status', 'requested')
            .single();

        if (existingEvacuation) {
            evacuationId = existingEvacuation.id;
        }

        // Auto-populate coordinates from clinic/hospital if not provided by frontend
        let finalPickupLat = pickup_latitude || null;
        let finalPickupLng = pickup_longitude || null;
        let finalDestLat = destination_latitude || null;
        let finalDestLng = destination_longitude || null;

        // Get clinic coordinates for pickup
        if (!finalPickupLat || !finalPickupLng) {
            const { data: clinic } = await supabase
                .from('clinics')
                .select('latitude, longitude')
                .eq('id', req.clinicId)
                .single();
            if (clinic?.latitude && clinic?.longitude) {
                finalPickupLat = clinic.latitude;
                finalPickupLng = clinic.longitude;
            }
        }

        // Try to get destination hospital coordinates from destination_location name match
        if (!finalDestLat || !finalDestLng) {
            const { data: hospital } = await supabase
                .from('hospitals')
                .select('latitude, longitude')
                .ilike('name', `%${destination_location}%`)
                .maybeSingle();
            if (hospital?.latitude && hospital?.longitude) {
                finalDestLat = hospital.latitude;
                finalDestLng = hospital.longitude;
            }
        }

        // Create booking
        const { data: booking, error: bookingError } = await supabase
            .from('transport_bookings')
            .insert({
                evacuation_id: evacuationId,
                patient_id,
                clinic_id: req.clinicId,
                company_id,
                vehicle_id,
                patient_risk_score: patient.risk_score || 50,
                recommended_vehicle_type: recommendedType,
                pickup_location,
                destination_location,
                pickup_latitude: finalPickupLat,
                pickup_longitude: finalPickupLng,
                destination_latitude: finalDestLat,
                destination_longitude: finalDestLng,
                urgency: urgency || 'medium',
                special_requirements,
                notes,
                booking_status: 'pending',
                requested_by: req.user.id,
                requested_at: new Date().toISOString()
            })
            .select(`
                *,
                patient:patients(id, name, patient_id, risk_score),
                clinic:clinics(id, name, operating_location),
                company:transport_companies(id, company_name, contact_phone),
                vehicle:vehicles(id, vehicle_name, vehicle_type)
            `)
            .single();

        if (bookingError) throw bookingError;

        // Update patient status
        await supabase
            .from('patients')
            .update({ status: 'transport_requested' })
            .eq('id', patient_id);

        // Emit real-time event
        req.io?.emit('booking:created', { booking });

        res.status(201).json({ data: booking });
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// ============================================================================
// GET BOOKING DETAILS
// ============================================================================

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate UUID format to prevent "invalid input syntax for type uuid" error
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
        if (!uuidRegex.test(id)) {
            console.warn(`[GET /:id] Invalid booking ID provided: ${id}. Skipping.`);
            return res.status(400).json({ error: 'Invalid booking ID format' });
        }

        const { data: booking, error } = await supabase
            .from('transport_bookings')
            .select(`
                *,
                patient:patients(id, name, patient_id, risk_score, status),
                clinic:clinics(id, name, operating_location, contact_phone),
                company:transport_companies(id, company_name, contact_email, contact_phone),
                vehicle:vehicles(id, vehicle_name, vehicle_type, capacity),
                driver:drivers(id, full_name, phone_number, current_status)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ data: booking });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({ error: 'Failed to fetch booking' });
    }
});

// ============================================================================
// UPDATE BOOKING STATUS
// ============================================================================

router.patch('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, driver_id } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const updates = { booking_status: status };

        // Set timestamps based on status
        const now = new Date().toISOString();
        if (status === 'confirmed') {
            updates.confirmed_at = now;
        } else if (status === 'driver_assigned' && driver_id) {
            updates.driver_id = driver_id;
            updates.driver_assigned_at = now;
        } else if (status === 'in_progress') {
            updates.started_at = now;
        } else if (status === 'completed') {
            updates.completed_at = now;
        }

        const { data: booking, error } = await supabase
            .from('transport_bookings')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Emit real-time event
        req.io?.emit('booking:status_updated', { booking });

        res.json({ data: booking });
    } catch (error) {
        console.error('Update booking status error:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

// ============================================================================
// GET BOOKINGS FOR CLINIC
// ============================================================================

router.get('/bookings', clinicAuth, async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('transport_bookings')
            .select(`
                *,
                patient:patients(id, name, patient_id),
                company:transport_companies(id, company_name),
                vehicle:vehicles(id, vehicle_name, vehicle_type),
                driver:drivers(id, full_name, phone_number)
            `)
            .eq('clinic_id', req.clinicId)
            .order('requested_at', { ascending: false });

        if (status) {
            query = query.eq('booking_status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            data: data || [],
            count: (data || []).length
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// ============================================================================
// GET BOOKINGS BY PATIENT ID (for hospital portal)
// ============================================================================

router.get('/patient/:patientId', authMiddleware, async (req, res) => {
    try {
        const { patientId } = req.params;
        const { status } = req.query;

        let query = supabase
            .from('transport_bookings')
            .select(`
                *,
                patient:patients(id, name, patient_id, risk_score),
                clinic:clinics(id, name, operating_location, contact_phone),
                company:transport_companies(id, company_name, contact_email, contact_phone),
                vehicle:vehicles(id, vehicle_name, vehicle_type, capacity),
                driver:drivers(id, full_name, phone_number, current_status)
            `)
            .eq('patient_id', patientId)
            .order('requested_at', { ascending: false });

        // Filter by status if provided
        if (status) {
            if (status === 'active') {
                // Active means any status except completed or cancelled
                query = query.not('booking_status', 'in', '(completed,cancelled)');
            } else {
                query = query.eq('booking_status', status);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            data: data || [],
            count: (data || []).length
        });
    } catch (error) {
        console.error('Get bookings by patient error:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

export default router;
