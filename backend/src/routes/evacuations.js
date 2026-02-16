import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware, clinicAuth } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/evacuations - List evacuation requests (isolated by clinic)
router.get('/', clinicAuth, async (req, res) => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('evacuations')
            .select(`
                *,
                patient:patients(id, name, patient_id),
                clinic:clinics(id, name, operating_location)
            `)
            .eq('origin_clinic_id', req.clinicId) // MANDATORY Isolation
            .order('id', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query;

        if (error) throw error;
        res.json({ data: data || [], count: (data || []).length });
    } catch (err) {
        console.error('GET /evacuations error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/evacuations - Create evacuation request
router.post('/', clinicAuth, async (req, res) => {
    try {
        const { patient_id, urgency, reason, notes } = req.body;

        if (!patient_id) {
            return res.status(400).json({ error: 'patient_id is required' });
        }

        // Verify patient belongs to clinic
        const { data: patient } = await supabase
            .from('patients')
            .select('clinic_id')
            .eq('id', patient_id)
            .single();

        if (!patient || patient.clinic_id !== req.clinicId) {
            return res.status(403).json({ error: 'Unauthorized access to this patient' });
        }

        const { data, error } = await supabase
            .from('evacuations')
            .insert([{
                patient_id,
                origin_clinic_id: req.clinicId, // SECURITY: Use clinic ID from token
                urgency: urgency || 'medium',
                reason,
                notes,
                status: 'requested',
                requested_by: req.user.id
            }])
            .select(`
                *,
                patient:patients(id, name, patient_id),
                clinic:clinics(id, name, operating_location)
            `)
            .single();

        if (error) throw error;

        // Update patient status
        await supabase
            .from('patients')
            .update({ status: 'evacuation_requested' })
            .eq('id', patient_id);

        // Emit real-time event
        req.io?.emit('evacuation:requested', { evacuation: data });

        res.status(201).json({ data });
    } catch (err) {
        console.error('POST /evacuations error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/evacuations/:id - Update evacuation status
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const { status, transport_id, assigned_route_id, eta } = req.body;

        const updates = { status };
        if (transport_id) updates.transport_id = transport_id;
        if (assigned_route_id) updates.assigned_route_id = assigned_route_id;
        if (eta) updates.eta = eta;

        if (status === 'in_transit') {
            updates.departed_at = new Date().toISOString();
        } else if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('evacuations')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        req.io?.emit('evacuation:updated', { evacuation: data });

        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
