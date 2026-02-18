import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware, clinicAuth } from '../middleware/authMiddleware.js';

const router = Router();

// ============================================
// ML-Grade Risk Scoring (Matching Frontend Logic)
// ============================================

const VITAL_CONFIG = {
    spo2: {
        min: 70, max: 100,
        ideal: [95, 100],
        weight: 0.30,
        label: 'SpO₂'
    },
    heart_rate: {
        min: 40, max: 180,
        ideal: [60, 100],
        weight: 0.25,
        label: 'Heart Rate'
    },
    respiratory_rate: {
        min: 8, max: 40,
        ideal: [12, 20],
        weight: 0.20,
        label: 'Resp. Rate'
    },
    bp_systolic: {
        min: 70, max: 200,
        ideal: [90, 140],
        weight: 0.10,
        label: 'BP Systolic'
    },
    bp_diastolic: {
        min: 40, max: 130,
        ideal: [60, 90],
        weight: 0.05,
        label: 'BP Diastolic'
    },
    temperature: {
        min: 34.0, max: 42.0,
        ideal: [36.1, 37.2],
        weight: 0.10,
        label: 'Temperature'
    }
};

const MAX_CONTRIBUTION_PER_VITAL = 35;

function calculateDeviationScore(value, vitalKey) {
    const config = VITAL_CONFIG[vitalKey];
    if (!config || value == null) return 0;

    const [idealLow, idealHigh] = config.ideal;

    // Within ideal range = 0 deviation
    if (value >= idealLow && value <= idealHigh) return 0;

    let deviation = 0;
    if (value < idealLow) {
        deviation = (idealLow - value) / (idealLow - config.min);
    } else {
        deviation = (value - idealHigh) / (config.max - idealHigh);
    }

    // Clamp deviation to 0-1
    deviation = Math.max(0, Math.min(1, deviation));

    // Exponential scaling for severe deviations
    const rawScore = Math.pow(deviation, 1.5) * 100;

    // Cap per-vital contribution
    return Math.min(rawScore, MAX_CONTRIBUTION_PER_VITAL);
}

const calculateRiskScore = (vitals) => {
    let totalScore = 0;
    let totalWeight = 0;
    const alerts = [];

    // Parse values safely (Use parseFloat to match frontend precision)
    const parsedVitals = {
        heart_rate: parseFloat(vitals.heart_rate) || null,
        spo2: parseFloat(vitals.spo2) || null,
        respiratory_rate: parseFloat(vitals.respiratory_rate) || null,
        temperature: parseFloat(vitals.temperature) || null
    };

    if (vitals.blood_pressure) {
        const parts = vitals.blood_pressure.split('/');
        if (parts.length === 2) {
            parsedVitals.bp_systolic = parseInt(parts[0]);
            parsedVitals.bp_diastolic = parseInt(parts[1]);
        }
    }

    // Calculate score
    for (const [vitalKey, config] of Object.entries(VITAL_CONFIG)) {
        const value = parsedVitals[vitalKey];
        if (value == null) continue;

        const deviation = calculateDeviationScore(value, vitalKey);
        const weightedScore = deviation * config.weight;

        totalScore += weightedScore;
        totalWeight += config.weight;

        // Generate alert if contribution is significant (> 4 points)
        if (weightedScore > 4) {
            const contribution = Math.round(weightedScore);
            alerts.push(`${config.label} deviation (+${contribution}pts)`);
        }
    }

    // Normalize
    const normalizedScore = totalWeight > 0
        ? Math.round((totalScore / totalWeight) * (1 / 0.3)) // Scale up
        : 0;

    const finalScore = Math.min(normalizedScore, 100);

    return { score: finalScore, alerts };
};


// GET /api/vitals - Get vitals for a patient (isolated by clinic)
router.get('/', clinicAuth, async (req, res) => {
    try {
        const { patient_id, limit = 50 } = req.query;

        if (!patient_id) {
            return res.status(400).json({ error: 'patient_id is required' });
        }

        // Verify patient belongs to clinician's clinic
        const { data: patient } = await supabase
            .from('patients')
            .select('clinic_id')
            .eq('id', patient_id)
            .single();

        if (!patient || patient.clinic_id !== req.clinicId) {
            return res.status(403).json({ error: 'Unauthorized access to this patient' });
        }

        let query = supabase
            .from('vitals_logs')
            .select('*')
            .eq('patient_id', patient_id);

        // Filter by active session if requested
        if (req.query.active_session === 'true') {
            query = query.eq('is_session_closed', false);
        }

        const { data, error } = await query
            .order('recorded_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vitals - Log new vitals
router.post('/', clinicAuth, async (req, res) => {
    try {
        const { patient_id, heart_rate, blood_pressure, spo2, temperature, respiratory_rate, notes } = req.body;

        if (!patient_id) {
            return res.status(400).json({ error: 'patient_id is required' });
        }

        // Verify patient belongs to clinician's clinic
        const { data: patient } = await supabase
            .from('patients')
            .select('clinic_id')
            .eq('id', patient_id)
            .single();

        if (!patient || patient.clinic_id !== req.clinicId) {
            return res.status(403).json({ error: 'Unauthorized access to this patient' });
        }

        const vitalsData = {
            patient_id,
            heart_rate,
            blood_pressure,
            spo2,
            temperature,
            respiratory_rate,
            notes,
            recorded_at: new Date().toISOString(),
            recorded_by: req.user.id
        };

        const { data, error } = await supabase
            .from('vitals_logs')
            .insert([vitalsData])
            .select()
            .single();

        if (error) throw error;

        // Calculate Risk Score (Matching Frontend Logic)
        const { score, alerts } = calculateRiskScore(vitalsData);

        // Critical Threshold: NEWS2-aligned (≥60 = High Risk requiring urgent response)
        const CRITICAL_SCORE_THRESHOLD = 60;

        console.log(`[POST /vitals] ========================================`);
        console.log(`[POST /vitals] Patient ${patient_id} Risk Score: ${score}/100`);
        console.log(`[POST /vitals] Alerts: ${alerts.join(', ')}`);

        // Update patient's vitals AND risk_score in database
        console.log(`[POST /vitals] 🔄 Updating patient vitals and risk_score to ${score}...`);
        const { error: patientUpdateError } = await supabase
            .from('patients')
            .update({
                heart_rate,
                blood_pressure,
                oxygen_saturation: spo2,
                temperature,
                respiratory_rate,
                risk_score: score
            })
            .eq('id', patient_id);

        if (patientUpdateError) {
            console.error(`[POST /vitals] ❌ Failed to update patient vitals:`, patientUpdateError);
        } else {
            console.log(`[POST /vitals] ✅ Patient vitals and risk score updated successfully`);
        }

        let isCriticalUpdate = false;

        if (score >= CRITICAL_SCORE_THRESHOLD) {
            console.log(`[POST /vitals] 🚨 CRITICAL SCORE (${score}) REACHED! Updating status.`);

            // Update patient status AND is_critical flag
            const { error: updateError } = await supabase
                .from('patients')
                .update({ status: 'critical', is_critical: true })
                .eq('id', patient_id);

            if (updateError) {
                console.error(`[POST /vitals] ❌ Failed to update patient as critical:`, updateError);
            } else {
                isCriticalUpdate = true;
                console.log(`[POST /vitals] ✅ Patient ${patient_id} marked as critical (is_critical=true)`);
            }
        }

        // Emit critical alert with score (only if critical)
        if (score >= CRITICAL_SCORE_THRESHOLD) {
            req.io?.emit('vitals:critical', {
                patientId: patient_id,
                vitals: data,
                score,
                alerts
            });
        }

        req.io?.emit('vitals:logged', { vitals: data });

        // Return score and alerts so frontend can show popup
        res.status(201).json({
            data,
            score,
            alerts,
            isCritical: isCriticalUpdate,
            warning: alerts.length > 0
        });
    } catch (err) {
        console.error('POST /vitals error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vitals/complete-session - Close current session
router.post('/complete-session', clinicAuth, async (req, res) => {
    try {
        const { patient_id } = req.body;

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
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        // Mark all open logs for this patient as closed
        const { error } = await supabase
            .from('vitals_logs')
            .update({ is_session_closed: true })
            .eq('patient_id', patient_id)
            .eq('is_session_closed', false);

        if (error) throw error;

        // Reset patient status to stable if completing a session?
        // Maybe optional? Probably safer to leave patient status as is unless explicit logic changes it.
        // User asked: "logs dont show in analysis timeline" - that's strictly handled by the query filter.

        res.json({ success: true, message: 'Session completed' });
    } catch (err) {
        console.error('Session completion error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
