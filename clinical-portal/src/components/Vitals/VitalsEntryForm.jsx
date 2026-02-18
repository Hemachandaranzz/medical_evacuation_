import { useState } from 'react';
import { api } from '../../services/apiClient';
import { Heart, Wind, Gauge, Thermometer, Activity, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import './VitalsEntryForm.css';

import PremiumAlertModal from './PremiumAlertModal';

export default function VitalsEntryForm({ patientId, onSuccess, onCompleteSession }) {
    const [saving, setSaving] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [error, setError] = useState(null);
    const [alertData, setAlertData] = useState(null); // Premium Modal State
    const [vitals, setVitals] = useState({
        heart_rate: '',
        spo2: '',
        bp_systolic: '',
        bp_diastolic: '',
        temperature: '',
        respiratory_rate: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setVitals(prev => ({ ...prev, [name]: value }));
    };

    // Critical thresholds for each vital
    const isHrCritical = () => {
        const val = parseInt(vitals.heart_rate);
        return val && (val < 50 || val > 120);
    };

    const isSpo2Critical = () => {
        const val = parseInt(vitals.spo2);
        return val && val < 90;
    };

    const isBpCritical = () => {
        const sys = parseInt(vitals.bp_systolic);
        const dia = parseInt(vitals.bp_diastolic);
        return (sys && (sys < 90 || sys > 180)) || (dia && (dia < 60 || dia > 120));
    };

    const isTempCritical = () => {
        const val = parseFloat(vitals.temperature);
        return val && (val < 35.0 || val > 39.5);
    };

    const isRrCritical = () => {
        const val = parseInt(vitals.respiratory_rate);
        return val && (val < 12 || val > 25);
    };

    const hasAnyCritical = () => {
        return isHrCritical() || isSpo2Critical() || isBpCritical() || isTempCritical() || isRrCritical();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!patientId) return;

        setSaving(true);
        setError(null);

        try {
            const bloodPressure = vitals.bp_systolic && vitals.bp_diastolic
                ? `${vitals.bp_systolic}/${vitals.bp_diastolic}`
                : null;

            const response = await api.post('/vitals', {
                patient_id: patientId,
                heart_rate: parseInt(vitals.heart_rate) || null,
                spo2: parseInt(vitals.spo2) || null,
                blood_pressure: bloodPressure,
                temperature: parseFloat(vitals.temperature) || null,
                respiratory_rate: parseInt(vitals.respiratory_rate) || null,
            });

            // Show Critical/Warning Popup using Premium Modal
            if (response.alerts && response.alerts.length > 0) {
                setAlertData({
                    isOpen: true,
                    type: response.isCritical ? 'critical' : 'warning',
                    data: response
                });
            }

            // Reset form
            setVitals({
                heart_rate: '',
                spo2: '',
                bp_systolic: '',
                bp_diastolic: '',
                temperature: '',
                respiratory_rate: '',
            });

            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('Error saving vitals:', err);
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCompleteSession = async () => {
        if (!patientId) return;

        setCompleting(true);
        try {
            // Mark session as complete (clear analysis for fresh start)
            // Mark session as complete in backend
            await api.post('/vitals/complete-session', { patient_id: patientId });

            // Update local state via callback
            if (onCompleteSession) {
                await onCompleteSession();
            }

            // Reset form
            setVitals({
                heart_rate: '',
                spo2: '',
                bp_systolic: '',
                bp_diastolic: '',
                temperature: '',
                respiratory_rate: '',
            });
        } catch (err) {
            console.error('Error completing session:', err);
            setError(err.message);
        } finally {
            setCompleting(false);
        }
    };

    if (!patientId) {
        return (
            <div className="form-placeholder">
                <Activity size={32} />
                <p>Select a patient to begin logging vitals</p>
            </div>
        );
    }

    return (
        <div className="vitals-entry">
            <h3 className="form-title">
                <Activity size={18} />
                New Vitals Record
            </h3>

            {error && (
                <div className="form-error">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* Row 1: HR, SpO2, BP */}
                <div className="vitals-row">
                    <div className={`vital-card ${isHrCritical() ? 'critical' : ''}`}>
                        <Heart className="icon heart" />
                        <span className="label">Heart Rate</span>
                        <input
                            type="number"
                            name="heart_rate"
                            value={vitals.heart_rate}
                            onChange={handleChange}
                            placeholder="--"
                            min="0"
                            max="300"
                        />
                        <span className="unit">BPM</span>
                    </div>

                    <div className={`vital-card ${isSpo2Critical() ? 'critical' : ''}`}>
                        <Wind className="icon spo2" />
                        <span className="label">SpO2</span>
                        <input
                            type="number"
                            name="spo2"
                            value={vitals.spo2}
                            onChange={handleChange}
                            placeholder="--"
                            min="0"
                            max="100"
                        />
                        <span className="unit">%</span>
                    </div>

                    <div className={`vital-card bp-card ${isBpCritical() ? 'critical' : ''}`}>
                        <Gauge className="icon bp" />
                        <span className="label">Blood Pressure</span>
                        <div className="bp-inputs">
                            <input
                                type="number"
                                name="bp_systolic"
                                value={vitals.bp_systolic}
                                onChange={handleChange}
                                placeholder="SYS"
                                min="0"
                                max="300"
                            />
                            <span className="slash">/</span>
                            <input
                                type="number"
                                name="bp_diastolic"
                                value={vitals.bp_diastolic}
                                onChange={handleChange}
                                placeholder="DIA"
                                min="0"
                                max="300"
                            />
                        </div>
                        <span className="unit">mmHg</span>
                    </div>
                </div>

                {/* Row 2: Temp, RR */}
                <div className="vitals-row row-2">
                    <div className={`vital-card ${isTempCritical() ? 'critical' : ''}`}>
                        <Thermometer className="icon temp" />
                        <span className="label">Temperature</span>
                        <input
                            type="number"
                            name="temperature"
                            value={vitals.temperature}
                            onChange={handleChange}
                            placeholder="--"
                            step="0.1"
                            min="30"
                            max="45"
                        />
                        <span className="unit">°C</span>
                    </div>

                    <div className={`vital-card ${isRrCritical() ? 'critical' : ''}`}>
                        <Activity className="icon rr" />
                        <span className="label">Resp. Rate</span>
                        <input
                            type="number"
                            name="respiratory_rate"
                            value={vitals.respiratory_rate}
                            onChange={handleChange}
                            placeholder="--"
                            min="0"
                            max="100"
                        />
                        <span className="unit">/min</span>
                    </div>
                </div>

                {hasAnyCritical() && (
                    <div className="critical-alert">
                        <AlertTriangle size={18} />
                        <span>Critical values detected! Consider immediate intervention.</span>
                    </div>
                )}

                {/* Button Group */}
                <div className="button-group">
                    <button type="submit" className="btn btn-primary submit-btn" disabled={saving}>
                        {saving ? <div className="spinner"></div> : <Save size={18} />}
                        {saving ? 'Saving...' : 'Save Record'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-success complete-btn"
                        onClick={handleCompleteSession}
                        disabled={completing}
                        title="Mark today's session as complete and start fresh"
                    >
                        {completing ? <div className="spinner"></div> : <CheckCircle2 size={18} />}
                        {completing ? 'Completing...' : 'Complete Session'}
                    </button>
                </div>
            </form>

            {/* Premium Alert Modal */}
            {alertData && (
                <PremiumAlertModal
                    isOpen={alertData.isOpen}
                    type={alertData.type}
                    data={alertData.data}
                    onClose={() => setAlertData(null)}
                />
            )}
        </div>
    );
}
