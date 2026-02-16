import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware, clinicAuth } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/patients - List patients (isolated by clinic)
router.get('/', clinicAuth, async (req, res) => {
    try {
        const { status, is_critical } = req.query;

        console.log(`[GET /patients] Request from User: ${req.user?.email || 'unknown'}, ClinicID: ${req.clinicId}`);

        let query = supabase
            .from('patients')
            .select('*')
            .eq('clinic_id', req.clinicId) // MANDATORY Isolation
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (is_critical === 'true') query = query.eq('is_critical', true);

        const { data, error } = await query;

        if (error) {
            console.error('[GET /patients] Database Error:', error);
            throw error;
        }

        console.log(`[GET /patients] Found ${data?.length || 0} patients for ClinicID: ${req.clinicId}`);
        res.json({ data, count: data.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET /api/patients/:id - Get single patient with vitals
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { data: patient, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', req.params.id)
            .eq('clinic_id', req.clinicId) // MANDATORY Isolation
            .single();

        if (error) throw error;

        // Get recent vitals
        const { data: vitals } = await supabase
            .from('vitals_logs')
            .select('*')
            .eq('patient_id', req.params.id)
            .order('recorded_at', { ascending: false })
            .limit(20);

        res.json({ data: { ...patient, vitals: vitals || [] } });
    } catch (err) {
        res.status(404).json({ error: 'Patient not found' });
    }
});

// POST /api/patients - Create new patient
router.post('/', clinicAuth, async (req, res) => {
    try {
        const { name, age, gender, blood_type, contact_number, emergency_contact } = req.body;

        // Generate patient ID: PAT-YYYY-XXXXX
        const year = new Date().getFullYear();
        const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        const patient_id = `PAT-${year}-${randomPart}`;

        const { data, error } = await supabase
            .from('patients')
            .insert([{
                patient_id,
                name,
                full_name: name,
                age,
                gender,
                blood_type,
                contact_number,
                emergency_contact,
                clinic_id: req.clinicId, // SECURITY: Use clinic ID from token
                status: 'stable'
            }])
            .select()
            .single();

        if (error) throw error;

        req.io?.emit('patient:created', { patient: data });

        res.status(201).json({ data });
    } catch (err) {
        console.error('POST /patients error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/patients/:id - Update patient
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const { status, ...updates } = req.body;

        const { data, error } = await supabase
            .from('patients')
            .update({ status, ...updates })
            .eq('id', req.params.id)
            .eq('clinic_id', req.clinicId) // MANDATORY Isolation
            .select()
            .single();

        if (error) throw error;

        if (status === 'critical') {
            req.io?.emit('patient:critical', { patient: data });
        }

        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
