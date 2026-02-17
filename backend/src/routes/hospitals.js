import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Get all hospitals (admin only - for approval list)
router.get('/pending', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.email !== 'finalyearproject2026ddd@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { data, error } = await supabase
            .from('hospitals')
            .select('*')
            .eq('status', 'pending_approval')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching pending hospitals:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve a hospital (admin only)
router.post('/:id/approve', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'finalyearproject2026ddd@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { id } = req.params;

        const { data, error } = await supabase
            .from('hospitals')
            .update({ status: 'active' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Update the user's profile role to hospital_admin
        if (data.admin_id) {
            await supabase
                .from('profiles')
                .update({ role: 'hospital_admin' })
                .eq('id', data.admin_id);
        }

        res.json({ message: 'Hospital approved', hospital: data });
    } catch (error) {
        console.error('Error approving hospital:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject a hospital (admin only)
router.post('/:id/reject', authMiddleware, async (req, res) => {
    try {
        if (req.user.email !== 'finalyearproject2026ddd@gmail.com') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { id } = req.params;

        const { data, error } = await supabase
            .from('hospitals')
            .update({ status: 'suspended' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Hospital rejected', hospital: data });
    } catch (error) {
        console.error('Error rejecting hospital:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get hospitals by region (for evacuation selection)
router.get('/by-region/:region', authMiddleware, async (req, res) => {
    try {
        const { region } = req.params;

        const { data, error } = await supabase
            .from('hospitals')
            .select('id, name, city, address, contact_phone, facility_type')
            .eq('region', region)
            .eq('status', 'active')
            .order('name');

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching hospitals by region:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get region mapping (origin -> target)
router.get('/region-mapping/:origin', authMiddleware, async (req, res) => {
    try {
        const { origin } = req.params;

        const { data, error } = await supabase
            .from('region_mappings')
            .select('target_region')
            .eq('origin_region', origin)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            // Default to Chennai if no mapping found
            return res.json({ target_region: 'Chennai' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching region mapping:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all active hospitals
router.get('/active', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hospitals')
            .select('*')
            .eq('status', 'active')
            .order('name');

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching active hospitals:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get active hospitals count (for stats)
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const { count: activeCount, error: activeError } = await supabase
            .from('hospitals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active');

        const { count: pendingCount, error: pendingError } = await supabase
            .from('hospitals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approval');

        if (activeError || pendingError) throw activeError || pendingError;

        res.json({
            active: activeCount || 0,
            pending: pendingCount || 0,
        });
    } catch (error) {
        console.error('Error fetching hospital stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all beds for a hospital
router.get('/:id/beds', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('hospital_beds')
            .select('*')
            .eq('hospital_id', id)
            .order('bed_number', { ascending: true });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching hospital beds:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
