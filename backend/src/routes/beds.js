import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Toggle bed occupancy
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_occupied, patient_id } = req.body;

        // 1. Update the bed in Supabase
        const updatePayload = {
            is_occupied,
            patient_id: is_occupied ? patient_id : null,
            occupied_since: is_occupied ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('hospital_beds')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // 2. Emit Socket.io event to the hospital's room
        // req.io is injected by index.js middleware
        if (req.io) {
            req.io.to(`hospital:${data.hospital_id}`).emit('bed_update', data);
        }

        res.json(data);
    } catch (error) {
        console.error('Error updating bed:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
