import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/clinics - List all clinics
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('clinics')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json({ data, count: data.length });
    } catch (err) {
        console.error('GET /clinics error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/clinics/me - Get current authenticated clinic
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('clinics')
            .select('*')
            .eq('admin_id', userId)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Clinic not found for this user' });
        }

        res.json({ data });
    } catch (err) {
        console.error('GET /clinics/me error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/clinics/:id - Get single clinic
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clinics')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(404).json({ error: 'Clinic not found' });
    }
});

// POST /api/clinics - Create new clinic (requires auth)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, location_name, region_type, facility_level, contact_phone } = req.body;

        const { data, error } = await supabase
            .from('clinics')
            .upsert([{
                name,
                location_name,
                operating_location: location_name, // Satisfy both potential columns
                region_type,
                facility_level,
                contact_phone,
                admin_id: req.user.id,
                admin_email: req.user.email,
                status: 'pending_approval'
            }], { onConflict: 'admin_id' })
            .select()
            .single();

        if (error) throw error;

        // Emit socket event for real-time
        req.io?.emit('clinic:created', { clinic: data });

        res.status(201).json({ data });
    } catch (err) {
        console.error('POST /clinics error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/clinics/:id/approve - Approve clinic
router.patch('/:id/approve', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clinics')
            .update({ status: 'active' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // Emit socket event
        req.io?.emit('clinic:approved', { clinicId: req.params.id, status: 'active' });

        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/clinics/:id/reject - Reject clinic
router.patch('/:id/reject', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clinics')
            .update({ status: 'suspended' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        req.io?.emit('clinic:rejected', { clinicId: req.params.id, status: 'suspended' });

        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
