import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// ============================================================================
// Helper: Calculate NEWS2 Risk Score from Vitals
// ============================================================================
function calculateNEWS2Score(vitals) {
    let news2Score = 0;

    // Respiration Rate
    if (vitals.respiratory_rate) {
        const rr = vitals.respiratory_rate;
        if (rr <= 8) news2Score += 3;
        else if (rr >= 9 && rr <= 11) news2Score += 1;
        else if (rr >= 21 && rr <= 24) news2Score += 2;
        else if (rr >= 25) news2Score += 3;
    }

    // Oxygen Saturation
    if (vitals.oxygen_saturation) {
        const spo2 = vitals.oxygen_saturation;
        if (spo2 <= 91) news2Score += 3;
        else if (spo2 >= 92 && spo2 <= 93) news2Score += 2;
        else if (spo2 >= 94 && spo2 <= 95) news2Score += 1;
    }

    // Blood Pressure (Systolic)
    if (vitals.blood_pressure) {
        const systolic = parseInt(vitals.blood_pressure.split('/')[0]) || 0;
        if (systolic <= 90) news2Score += 3;
        else if (systolic >= 91 && systolic <= 100) news2Score += 2;
        else if (systolic >= 101 && systolic <= 110) news2Score += 1;
        else if (systolic >= 220) news2Score += 3;
    }

    // Heart Rate
    if (vitals.heart_rate) {
        const hr = vitals.heart_rate;
        if (hr <= 40) news2Score += 3;
        else if (hr >= 41 && hr <= 50) news2Score += 1;
        else if (hr >= 91 && hr <= 110) news2Score += 1;
        else if (hr >= 111 && hr <= 130) news2Score += 2;
        else if (hr >= 131) news2Score += 3;
    }

    // Temperature
    if (vitals.temperature) {
        const temp = parseFloat(vitals.temperature);
        if (temp <= 35.0) news2Score += 3;
        else if (temp >= 35.1 && temp <= 36.0) news2Score += 1;
        else if (temp >= 38.1 && temp <= 39.0) news2Score += 1;
        else if (temp >= 39.1) news2Score += 2;
    }

    // Map NEWS2 (0-20) to 0-100 scale
    let riskScore;
    if (news2Score === 0) riskScore = 10;
    else if (news2Score <= 4) riskScore = 20 + (news2Score * 7);
    else if (news2Score <= 6) riskScore = 50 + (news2Score * 3);
    else riskScore = Math.min(70 + (news2Score * 4), 100);

    return riskScore;
}

// ============================================================================
// Helper: Sync Patient Risk Score from Latest Vitals
// ============================================================================
async function syncPatientRiskScore(patientId) {
    try {
        // Get patient's current vitals
        const { data: patient } = await supabase
            .from('patients')
            .select('heart_rate, blood_pressure, oxygen_saturation, temperature, respiratory_rate, risk_score')
            .eq('id', patientId)
            .single();

        if (!patient) return;

        // Calculate risk score from current vitals
        const calculatedScore = calculateNEWS2Score(patient);

        // Only update if score changed
        if (calculatedScore !== patient.risk_score) {
            console.log(`[SYNC] Updating patient ${patientId} risk_score: ${patient.risk_score} → ${calculatedScore}`);
            await supabase
                .from('patients')
                .update({ risk_score: calculatedScore })
                .eq('id', patientId);
        }
    } catch (error) {
        console.error(`[SYNC] Failed to sync risk_score for patient ${patientId}:`, error);
    }
}

// ============================================================================
// GET /api/critical/hospitals/:region - Get all active hospitals in a region
// ============================================================================
router.get('/hospitals/:region', async (req, res) => {
    try {
        const { region } = req.params;

        const { data, error } = await supabase
            .from('hospitals')
            .select('id, name, city, facility_type, contact_phone')
            .eq('region', region)
            .eq('status', 'active')
            .order('name');

        if (error) throw error;

        res.json({ success: true, hospitals: data || [] });
    } catch (error) {
        console.error('Error fetching hospitals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /api/critical/nearby/:clinicId - Get hospitals in the clinic's target region
// ============================================================================
router.get('/nearby/:clinicId', async (req, res) => {
    try {
        const { clinicId } = req.params;
        console.log(`\n========== NEARBY HOSPITAL DEBUG ==========`);
        console.log(`[NEARBY] Clinic ID: ${clinicId}`);

        // 1. Get clinic's operating location
        const { data: clinic, error: clinicError } = await supabase
            .from('clinics')
            .select('id, name, operating_location')
            .eq('id', clinicId)
            .single();

        if (clinicError) {
            console.log(`[NEARBY] ❌ Clinic Error:`, clinicError);
            throw clinicError;
        }
        console.log(`[NEARBY] ✅ Clinic: ${clinic?.name}`);
        console.log(`[NEARBY] ✅ Operating Location: "${clinic?.operating_location}"`);

        // 2. Get ALL target regions from mappings (may have multiple)
        // e.g., Havelock Island → [Chennai, Puducherry]
        const { data: mappings, error: mapError } = await supabase
            .from('region_mappings')
            .select('target_region')
            .eq('origin_region', clinic.operating_location);

        if (mapError) {
            console.log(`[NEARBY] ❌ Mapping Error:`, mapError);
        }
        console.log(`[NEARBY] ✅ Mappings found: ${mappings?.length || 0}`, mappings);

        // Extract all target regions, or use clinic location if no mappings
        const targetRegions = mappings && mappings.length > 0
            ? mappings.map(m => m.target_region)
            : [clinic.operating_location];

        console.log(`[NEARBY] ✅ Target Regions:`, targetRegions);

        // 3. Get all active active hospitals in ANY of the target regions
        // NOTE: Hospitals use 'region' field, NOT 'operating_location'
        const { data: rawHospitals, error: hospError } = await supabase
            .from('hospitals')
            .select(`
                id, name, city, facility_type, contact_phone, region, status,
                total_beds, specialities,
                hospital_beds(is_occupied)
            `)
            .in('region', targetRegions)  // ✅ Query multiple regions
            .eq('status', 'active')
            .order('name');

        if (hospError) {
            console.log(`[NEARBY] ❌ Hospital Query Error:`, hospError);
            throw hospError;
        }

        // Process hospitals to calculate available beds
        const hospitals = rawHospitals?.map(h => {
            const occupiedCount = h.hospital_beds?.filter(b => b.is_occupied).length || 0;
            return {
                ...h,
                hospital_beds: undefined, // Remove the raw beds array to keep response clean
                available_beds: (h.total_beds || 0) - occupiedCount,
                total_beds: h.total_beds || 0,
                specialities: h.specialities || []
            };
        });

        console.log(`[NEARBY] ✅ Hospitals found: ${hospitals?.length || 0}`);
        hospitals?.forEach(h => console.log(`   - ${h.name} (Avl: ${h.available_beds}/${h.total_beds})`));
        console.log(`============================================\n`);

        res.json({
            success: true,
            clinic: clinic,
            targetRegions: targetRegions,  // Array of regions
            hospitals: hospitals || []
        });
    } catch (error) {
        console.error('[NEARBY] ❌ Error fetching nearby hospitals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /api/critical/share - Share critical patient to selected hospital
// ============================================================================
router.post('/share', async (req, res) => {
    try {
        const { patient_id, clinic_id, hospital_id, notes } = req.body;
        const io = req.io; // Injected via middleware

        if (!patient_id || !clinic_id || !hospital_id) {
            return res.status(400).json({
                success: false,
                error: 'patient_id, clinic_id, and hospital_id are required'
            });
        }

        // 1. Check if an active (non-acknowledged) case already exists
        const { data: existingCase } = await supabase
            .from('critical_cases')
            .select('id, status, target_hospital_id')
            .eq('patient_id', patient_id)
            .eq('status', 'shared')
            .single();

        if (existingCase) {
            return res.json({
                success: true,
                message: 'Case already shared and awaiting acknowledgement',
                case: existingCase,
                isExisting: true
            });
        }

        // 2. Sync risk_score from latest vitals to ensure accuracy
        await syncPatientRiskScore(patient_id);

        // 3. Mark patient as critical
        await supabase
            .from('patients')
            .update({ is_critical: true })
            .eq('id', patient_id);

        // 3. Create critical case record
        const { data: newCase, error: createError } = await supabase
            .from('critical_cases')
            .insert({
                patient_id,
                clinic_id,
                target_hospital_id: hospital_id,
                notes: notes || null,
                status: 'shared',
                shared_at: new Date().toISOString()
            })
            .select(`
                *,
                patient:patients(id, name, patient_id, age, gender, blood_type),
                clinic:clinics(id, name, operating_location),
                hospital:hospitals(id, name, city)
            `)
            .single();

        if (createError) throw createError;

        console.log(`✅ Critical case shared: Patient ${patient_id} → Hospital ${hospital_id}`);
        console.log(`   Case ID: ${newCase.id}, Status: ${newCase.status}`);

        // 4. Emit real-time event to hospital
        if (io) {
            io.to(`hospital-${hospital_id}`).emit('critical:new', newCase);
            console.log(`📡 Emitted critical:new to hospital-${hospital_id}`);
        }

        res.json({
            success: true,
            message: 'Critical case shared successfully',
            case: newCase,
            isExisting: false
        });
    } catch (error) {
        console.error('Error sharing critical case:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /api/critical/acknowledge/:id - Hospital acknowledges receipt
// ============================================================================
router.post('/acknowledge/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { hospital_id } = req.body;
        const io = req.io;

        // 1. Get the case
        const { data: criticalCase, error: fetchError } = await supabase
            .from('critical_cases')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !criticalCase) {
            return res.status(404).json({ success: false, error: 'Case not found' });
        }

        // 2. Validate hospital ownership
        if (hospital_id && criticalCase.target_hospital_id !== hospital_id) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to acknowledge this case'
            });
        }

        // 3. Check if already acknowledged
        if (criticalCase.status === 'acknowledged') {
            return res.json({
                success: true,
                message: 'Case already acknowledged',
                case: criticalCase
            });
        }

        // 4. Update status
        const { data: updatedCase, error: updateError } = await supabase
            .from('critical_cases')
            .update({
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 5. Automatically assign a bed (Auto-Allocation)
        // Find the first available bed in the hospital
        const { data: availableBed, error: bedFetchError } = await supabase
            .from('hospital_beds')
            .select('id, bed_number, ward')
            .eq('hospital_id', criticalCase.target_hospital_id)
            .eq('is_occupied', false)
            .order('bed_number', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (bedFetchError) {
            console.error('Error finding available bed:', bedFetchError);
        } else if (availableBed) {
            // Assign the bed
            const { error: bedUpdateError } = await supabase
                .from('hospital_beds')
                .update({
                    is_occupied: true,
                    patient_id: criticalCase.patient_id,
                    occupied_since: new Date().toISOString()
                })
                .eq('id', availableBed.id);

            if (bedUpdateError) {
                console.error('Error assigning bed:', bedUpdateError);
            } else {
                console.log(`✅ Auto-assigned Bed #${availableBed.bed_number} (${availableBed.ward}) to Patient ${criticalCase.patient_id}`);
                updatedCase.assigned_bed = availableBed; // Attach to response for UI
            }
        } else {
            console.warn(`⚠️ No beds available for Hospital ${criticalCase.target_hospital_id}`);
        }

        // 5. Emit event to clinic
        if (io) {
            io.to(`clinic-${criticalCase.clinic_id}`).emit('critical:acknowledged', updatedCase);
            console.log(`📡 Emitted critical:acknowledged to clinic-${criticalCase.clinic_id}`);
        }

        res.json({
            success: true,
            message: 'Case acknowledged successfully',
            case: updatedCase
        });
    } catch (error) {
        console.error('Error acknowledging case:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /api/critical/hospital/:hospitalId - Get cases for a hospital
// ============================================================================
router.get('/hospital/:hospitalId', async (req, res) => {
    try {
        const { hospitalId } = req.params;

        const { data: cases, error } = await supabase
            .from('critical_cases')
            .select(`
                *,
                clinic:clinic_id (id, name, operating_location),
                patient:patient_id (
                    id, patient_id, name, age, gender,
                    heart_rate, blood_pressure, oxygen_saturation,
                    temperature, respiratory_rate, risk_score
                )
            `)
            .eq('target_hospital_id', hospitalId)
            .neq('status', 'closed')
            .order('shared_at', { ascending: false });

        if (error) throw error;

        const casesWithRisk = (cases || []).map(c => {
            // If risk_score already set in DB, use it
            if (c.patient?.risk_score) {
                return { ...c, risk_score: c.patient.risk_score };
            }

            // Calculate NEWS2 (National Early Warning Score 2) - NHS Clinical Standard
            // Reference: https://www.england.nhs.uk/ourwork/clinical-policy/sepsis/nationalearlywarningscore/
            const p = c.patient || {};
            let news2Score = 0;

            // === RESPIRATION RATE (breaths/min) ===
            // NEWS2 Chart: ≤8 = 3, 9-11 = 1, 12-20 = 0, 21-24 = 2, ≥25 = 3
            if (p.respiratory_rate) {
                const rr = p.respiratory_rate;
                if (rr <= 8) news2Score += 3;
                else if (rr >= 9 && rr <= 11) news2Score += 1;
                else if (rr >= 12 && rr <= 20) news2Score += 0;
                else if (rr >= 21 && rr <= 24) news2Score += 2;
                else if (rr >= 25) news2Score += 3;
            }

            // === OXYGEN SATURATION (SpO2 %) ===
            // NEWS2 Scale 1: ≤91 = 3, 92-93 = 2, 94-95 = 1, ≥96 = 0
            if (p.oxygen_saturation) {
                const spo2 = p.oxygen_saturation;
                if (spo2 <= 91) news2Score += 3;
                else if (spo2 >= 92 && spo2 <= 93) news2Score += 2;
                else if (spo2 >= 94 && spo2 <= 95) news2Score += 1;
                else if (spo2 >= 96) news2Score += 0;
            }

            // === SYSTOLIC BLOOD PRESSURE (mmHg) ===
            // NEWS2: ≤90 = 3, 91-100 = 2, 101-110 = 1, 111-219 = 0, ≥220 = 3
            if (p.blood_pressure) {
                const systolic = parseInt(p.blood_pressure.split('/')[0]) || 0;
                if (systolic <= 90) news2Score += 3;
                else if (systolic >= 91 && systolic <= 100) news2Score += 2;
                else if (systolic >= 101 && systolic <= 110) news2Score += 1;
                else if (systolic >= 111 && systolic <= 219) news2Score += 0;
                else if (systolic >= 220) news2Score += 3;
            }

            // === HEART RATE (bpm) ===
            // NEWS2: ≤40 = 3, 41-50 = 1, 51-90 = 0, 91-110 = 1, 111-130 = 2, ≥131 = 3
            if (p.heart_rate) {
                const hr = p.heart_rate;
                if (hr <= 40) news2Score += 3;
                else if (hr >= 41 && hr <= 50) news2Score += 1;
                else if (hr >= 51 && hr <= 90) news2Score += 0;
                else if (hr >= 91 && hr <= 110) news2Score += 1;
                else if (hr >= 111 && hr <= 130) news2Score += 2;
                else if (hr >= 131) news2Score += 3;
            }

            // === TEMPERATURE (°C) ===
            // NEWS2: ≤35.0 = 3, 35.1-36.0 = 1, 36.1-38.0 = 0, 38.1-39.0 = 1, ≥39.1 = 2
            if (p.temperature) {
                const temp = parseFloat(p.temperature);
                if (temp <= 35.0) news2Score += 3;
                else if (temp >= 35.1 && temp <= 36.0) news2Score += 1;
                else if (temp >= 36.1 && temp <= 38.0) news2Score += 0;
                else if (temp >= 38.1 && temp <= 39.0) news2Score += 1;
                else if (temp >= 39.1) news2Score += 2;
            }

            // NEWS2 total can be 0-20. Map to 0-100 scale for system consistency
            // NEWS2 Clinical Response Thresholds:
            //   0 = Low risk, 1-4 = Low-Medium, 5-6 = Medium (urgent response), 7+ = High (emergency)
            // Mapping to 0-100: NEWS2 0 → 10, 1-4 → 20-50, 5-6 → 60-70, 7+ → 80-100
            let riskScore;
            if (news2Score === 0) riskScore = 10;
            else if (news2Score <= 4) riskScore = 20 + (news2Score * 7); // 27-48
            else if (news2Score <= 6) riskScore = 50 + (news2Score * 3); // 65-68
            else riskScore = Math.min(70 + (news2Score * 4), 100); // 98-100

            return { ...c, risk_score: riskScore, news2_raw: news2Score };
        });

        casesWithRisk.sort((a, b) => {
            if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
            return new Date(b.shared_at) - new Date(a.shared_at);
        });

        console.log(`📋 Fetched ${casesWithRisk.length} cases for hospital ${hospitalId}`);
        res.json({ success: true, cases: casesWithRisk });
    } catch (error) {
        console.error('Error fetching hospital cases:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /api/critical/clinic/:clinicId - Get cases shared by a clinic
// ============================================================================
router.get('/clinic/:clinicId', async (req, res) => {
    try {
        const { clinicId } = req.params;

        const { data, error } = await supabase
            .from('critical_cases')
            .select(`
                *,
                patient:patients(id, name, patient_id, age, gender),
                hospital:hospitals(id, name, city, region)
            `)
            .eq('clinic_id', clinicId)
            .order('shared_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, cases: data || [] });
    } catch (error) {
        console.error('Error fetching clinic cases:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /api/critical/patient/:patientId/vitals - Get all vitals history for graphs
// ============================================================================
router.get('/patient/:patientId/vitals', async (req, res) => {
    try {
        const { patientId } = req.params;

        const { data, error } = await supabase
            .from('vitals_logs')
            .select('*')
            .eq('patient_id', patientId)
            .order('recorded_at', { ascending: true });

        if (error) throw error;

        res.json({ success: true, vitals: data || [] });
    } catch (error) {
        console.error('Error fetching vitals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /api/critical/patient/:patientId - Get full patient details for hospital view
// ============================================================================
router.get('/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;

        // Get patient
        const { data: patient, error: patientError } = await supabase
            .from('patients')
            .select('*')
            .eq('id', patientId)
            .single();

        if (patientError) throw patientError;

        // Get all vitals for history graphs
        const { data: vitals, error: vitalsError } = await supabase
            .from('vitals_logs')
            .select('*')
            .eq('patient_id', patientId)
            .order('recorded_at', { ascending: true });

        if (vitalsError) throw vitalsError;

        // Get medical history
        const { data: history } = await supabase
            .from('medical_history')
            .select('*')
            .eq('patient_id', patientId);

        res.json({
            success: true,
            patient,
            vitals: vitals || [],
            medicalHistory: history || []
        });
    } catch (error) {
        console.error('Error fetching patient details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

