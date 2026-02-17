import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

const authenticateProvider = async (req, res, next) => {
    await authenticateUser(req, res, async () => {
        // Verify user is a transport company
        const { data: company, error: companyError } = await supabase
            .from('transport_companies')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        if (companyError || !company) {
            return res.status(403).json({ error: 'User is not a transport company' });
        }

        req.company = company;
        next();
    });
};

const authenticateDriver = async (req, res, next) => {
    await authenticateUser(req, res, async () => {
        // Verify user is a driver
        const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        if (driverError || !driver) {
            return res.status(403).json({ error: 'User is not a driver' });
        }

        req.driver = driver;
        next();
    });
};

// ============================================================================
// PROVIDER ROUTES
// ============================================================================

// Get provider profile
router.get('/provider/profile', authenticateProvider, (req, res) => {
    res.json({ company: req.company });
});

// Update provider profile
router.patch('/provider/profile', authenticateProvider, async (req, res) => {
    const { company_name, contact_email, contact_phone } = req.body;

    try {
        const { data, error } = await supabase
            .from('transport_companies')
            .update({ company_name, contact_email, contact_phone })
            .eq('id', req.company.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ company: data });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get all drivers for a provider
router.get('/provider/drivers', authenticateProvider, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*, vehicles(vehicle_name)')
            .eq('company_id', req.company.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ drivers: data });
    } catch (error) {
        console.error('Get drivers error:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

// Add a new driver
router.post('/provider/drivers', authenticateProvider, async (req, res) => {
    const { full_name, email, phone_number, license_number, license_expiry_date, assigned_vehicle_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('drivers')
            .insert({
                company_id: req.company.id,
                full_name,
                email,
                phone_number,
                license_number,
                license_expiry_date,
                assigned_vehicle_id: assigned_vehicle_id || null
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ driver: data });
    } catch (error) {
        console.error('Add driver error:', error);
        res.status(500).json({ error: 'Failed to add driver' });
    }
});

// Delete a driver
router.delete('/provider/drivers/:driverId', authenticateProvider, async (req, res) => {
    const { driverId } = req.params;

    try {
        const { error } = await supabase
            .from('drivers')
            .delete()
            .eq('id', driverId)
            .eq('company_id', req.company.id);

        if (error) throw error;

        res.json({ message: 'Driver deleted successfully' });
    } catch (error) {
        console.error('Delete driver error:', error);
        res.status(500).json({ error: 'Failed to delete driver' });
    }
});

// Get all vehicles for a provider
router.get('/provider/vehicles', authenticateProvider, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('company_id', req.company.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ vehicles: data });
    } catch (error) {
        console.error('Get vehicles error:', error);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// Add a new vehicle
router.post('/provider/vehicles', authenticateProvider, async (req, res) => {
    const { vehicle_name, vehicle_type, license_plate, capacity } = req.body;

    try {
        const { data, error } = await supabase
            .from('vehicles')
            .insert({
                company_id: req.company.id,
                vehicle_name,
                vehicle_type,
                license_plate,
                capacity: parseInt(capacity)
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ vehicle: data });
    } catch (error) {
        console.error('Add vehicle error:', error);
        res.status(500).json({ error: 'Failed to add vehicle' });
    }
});

// Delete a vehicle
router.delete('/provider/vehicles/:vehicleId', authenticateProvider, async (req, res) => {
    const { vehicleId } = req.params;

    try {
        const { error } = await supabase
            .from('vehicles')
            .delete()
            .eq('id', vehicleId)
            .eq('company_id', req.company.id);

        if (error) throw error;

        res.json({ message: 'Vehicle deleted successfully' });
    } catch (error) {
        console.error('Delete vehicle error:', error);
        res.status(500).json({ error: 'Failed to delete vehicle' });
    }
});

// Get analytics for provider
router.get('/provider/analytics', authenticateProvider, async (req, res) => {
    try {
        const { count: totalDrivers } = await supabase
            .from('drivers')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', req.company.id);

        const { count: availableDrivers } = await supabase
            .from('drivers')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', req.company.id)
            .eq('current_status', 'available');

        const { count: totalVehicles } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', req.company.id);

        const { count: totalTrips } = await supabase
            .from('transport_assignments')
            .select('*, drivers!inner(*)', { count: 'exact', head: true })
            .eq('drivers.company_id', req.company.id);

        const { count: activeTrips } = await supabase
            .from('transport_assignments')
            .select('*, drivers!inner(*)', { count: 'exact', head: true })
            .eq('drivers.company_id', req.company.id)
            .in('current_status', ['accepted', 'en_route_pickup', 'patient_loaded', 'en_route_hospital']);

        res.json({
            totalDrivers: totalDrivers || 0,
            availableDrivers: availableDrivers || 0,
            totalVehicles: totalVehicles || 0,
            totalTrips: totalTrips || 0,
            activeTrips: activeTrips || 0
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ============================================================================
// DRIVER ROUTES
// ============================================================================

// Get driver profile
router.get('/driver/profile', authenticateDriver, (req, res) => {
    res.json({ driver: req.driver });
});

// Update driver status
router.patch('/driver/status', authenticateDriver, async (req, res) => {
    const { status } = req.body;

    try {
        const { data, error } = await supabase
            .from('drivers')
            .update({ current_status: status })
            .eq('id', req.driver.id)
            .select()
            .single();

        if (error) throw error;

        // Emit socket event
        req.io?.emit('driver:updated', { driverId: req.driver.id, status });

        res.json({ driver: data });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Update driver location
router.patch('/driver/location', authenticateDriver, async (req, res) => {
    const { latitude, longitude } = req.body;

    try {
        const { data, error } = await supabase
            .from('drivers')
            .update({
                current_latitude: latitude,
                current_longitude: longitude,
                location_updated_at: new Date().toISOString()
            })
            .eq('id', req.driver.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ driver: data });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

export default router;
