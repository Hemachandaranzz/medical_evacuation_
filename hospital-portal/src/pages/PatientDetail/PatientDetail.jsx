import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';
import PatientTransportStatus from '../../components/PatientTransportStatus/PatientTransportStatus';
import './PatientDetail.css';

const PatientDetail = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);
    const [vitals, setVitals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPatientData();
    }, [patientId]);

    const fetchPatientData = async () => {
        try {
            // Fetch patient details
            const { data: patientData, error: patientError } = await supabase
                .from('patients')
                .select(`
                    *,
                    clinic:clinics(id, name, location_name)
                `)
                .eq('id', patientId)
                .single();

            if (patientError) throw patientError;
            setPatient(patientData);

            // Fetch vitals history
            const { data: vitalsData, error: vitalsError } = await supabase
                .from('vitals_logs')
                .select('*')
                .eq('patient_id', patientId)
                .order('recorded_at', { ascending: false })
                .limit(20);

            if (vitalsError) throw vitalsError;
            setVitals(vitalsData || []);
        } catch (error) {
            console.error('Error fetching patient:', error);
            toast.error('Failed to load patient data');
        } finally {
            setLoading(false);
        }
    };

    const getVitalStatus = (type, value) => {
        const thresholds = {
            heart_rate: { low: 60, high: 100 },
            spo2: { low: 94, high: 100 },
            temperature: { low: 36.1, high: 37.2 },
            respiratory_rate: { low: 12, high: 20 },
        };

        const threshold = thresholds[type];
        if (!threshold || value === null || value === undefined) return 'normal';

        if (value < threshold.low || value > threshold.high) return 'abnormal';
        return 'normal';
    };

    if (loading) {
        return (
            <div className="patient-container">
                <div className="loading-state">Loading patient data...</div>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="patient-container">
                <div className="error-state">Patient not found</div>
            </div>
        );
    }

    const latestVitals = vitals[0];

    return (
        <div className="patient-container">
            <header className="patient-header">
                <button className="back-btn" onClick={() => navigate(-1)}>
                    ← Back to Dashboard
                </button>
                <h1>Patient Details</h1>
            </header>

            <main className="patient-main">
                {/* Patient Info Card */}
                <section className="patient-info-card">
                    <div className="info-header">
                        <div className="patient-avatar">
                            {patient.name?.charAt(0)?.toUpperCase() || 'P'}
                        </div>
                        <div className="patient-basic">
                            <h2>{patient.name}</h2>
                            <span className="patient-id">{patient.patient_id}</span>
                        </div>
                    </div>
                    <div className="info-grid">
                        <div className="info-item">
                            <span className="info-label">Age</span>
                            <span className="info-value">{patient.age} years</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Gender</span>
                            <span className="info-value">{patient.gender}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Blood Type</span>
                            <span className="info-value">{patient.blood_type || 'Unknown'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Origin</span>
                            <span className="info-value">{patient.clinic?.name} ({patient.clinic?.location_name})</span>
                        </div>
                    </div>
                </section>

                {/* Transport Status */}
                <PatientTransportStatus patientId={patient.id} />

                {/* Current Vitals */}
                <section className="vitals-section">
                    <h3>Current Vitals</h3>
                    {latestVitals ? (
                        <div className="vitals-grid">
                            <div className={`vital-card ${getVitalStatus('heart_rate', latestVitals.heart_rate)}`}>
                                <span className="vital-icon">❤️</span>
                                <span className="vital-value">{latestVitals.heart_rate || '--'}</span>
                                <span className="vital-label">Heart Rate (bpm)</span>
                            </div>
                            <div className={`vital-card ${getVitalStatus('spo2', latestVitals.spo2)}`}>
                                <span className="vital-icon">🫁</span>
                                <span className="vital-value">{latestVitals.spo2 || '--'}%</span>
                                <span className="vital-label">SpO2</span>
                            </div>
                            <div className={`vital-card`}>
                                <span className="vital-icon">🩸</span>
                                <span className="vital-value">{latestVitals.blood_pressure || '--'}</span>
                                <span className="vital-label">Blood Pressure</span>
                            </div>
                            <div className={`vital-card ${getVitalStatus('temperature', latestVitals.temperature)}`}>
                                <span className="vital-icon">🌡️</span>
                                <span className="vital-value">{latestVitals.temperature || '--'}°C</span>
                                <span className="vital-label">Temperature</span>
                            </div>
                            <div className={`vital-card ${getVitalStatus('respiratory_rate', latestVitals.respiratory_rate)}`}>
                                <span className="vital-icon">💨</span>
                                <span className="vital-value">{latestVitals.respiratory_rate || '--'}</span>
                                <span className="vital-label">Resp. Rate</span>
                            </div>
                        </div>
                    ) : (
                        <div className="no-vitals">No vitals data available</div>
                    )}
                    <p className="vitals-timestamp">
                        Last updated: {latestVitals ? new Date(latestVitals.recorded_at).toLocaleString() : 'N/A'}
                    </p>
                </section>



                {/* Vitals History */}
                <section className="history-section">
                    <h3>Vitals History</h3>
                    <div className="history-table-wrapper">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>HR</th>
                                    <th>SpO2</th>
                                    <th>BP</th>
                                    <th>Temp</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vitals.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="no-data">No history available</td>
                                    </tr>
                                ) : (
                                    vitals.map((v) => (
                                        <tr key={v.id}>
                                            <td>{new Date(v.recorded_at).toLocaleString()}</td>
                                            <td className={getVitalStatus('heart_rate', v.heart_rate)}>{v.heart_rate || '--'}</td>
                                            <td className={getVitalStatus('spo2', v.spo2)}>{v.spo2 || '--'}%</td>
                                            <td>{v.blood_pressure || '--'}</td>
                                            <td className={getVitalStatus('temperature', v.temperature)}>{v.temperature || '--'}°C</td>
                                            <td>{v.notes || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default PatientDetail;
