import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/apiClient';
import toast from 'react-hot-toast';
import './CriticalRecords.css';

const CriticalRecords = () => {
    const { clinic } = useAuth();
    const [patients, setPatients] = useState([]);
    const [sharedCases, setSharedCases] = useState([]);
    const [loading, setLoading] = useState(true);

    // Hospital selection modal
    const [showModal, setShowModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [loadingHospitals, setLoadingHospitals] = useState(false);
    const [sharing, setSharing] = useState(false);

    // Fetch critical patients and shared cases
    const fetchData = useCallback(async () => {
        if (!clinic?.id) return;

        try {
            // Fetch critical patients using authenticated API client
            const patientsData = await api.get(`/patients?is_critical=true`);

            // Fetch shared cases status
            const casesData = await api.get(`/critical/clinic/${clinic.id}`);

            if (patientsData.data) {
                setPatients(patientsData.data || []);
            }

            if (casesData.success) {
                setSharedCases(casesData.cases || []);
            }
        } catch (error) {
            console.error('Error fetching critical data:', error);
        } finally {
            setLoading(false);
        }
    }, [clinic?.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Get case status for a patient
    const getPatientCaseStatus = (patientId) => {
        const patientCase = sharedCases.find(c => c.patient_id === patientId);
        if (!patientCase) return { status: 'critical', label: 'Not Shared' };
        if (patientCase.status === 'acknowledged') return { status: 'acknowledged', label: 'Acknowledged', hospital: patientCase.hospital?.name };
        return { status: 'shared', label: 'Sent', hospital: patientCase.hospital?.name };
    };

    // Open hospital selection modal
    const handleShareClick = async (patient) => {
        setSelectedPatient(patient);
        setSelectedHospital(null);
        setShowModal(true);
        setLoadingHospitals(true);

        try {
            const data = await api.get(`/critical/nearby/${clinic.id}`);

            if (data.success) {
                setHospitals(data.hospitals || []);
            } else {
                toast.error('Failed to load hospitals');
            }
        } catch (error) {
            console.error('Error fetching hospitals:', error);
            toast.error('Failed to load hospitals');
        } finally {
            setLoadingHospitals(false);
        }
    };

    // Confirm share to selected hospital
    const handleConfirmShare = async () => {
        if (!selectedPatient || !selectedHospital) return;

        setSharing(true);
        try {
            const data = await api.post('/critical/share', {
                patient_id: selectedPatient.id,
                clinic_id: clinic.id,
                hospital_id: selectedHospital.id
            });

            if (data.success) {
                toast.success(`Patient shared to ${selectedHospital.name}!`);
                setShowModal(false);
                fetchData(); // Refresh
            } else {
                toast.error(data.error || 'Failed to share');
            }
        } catch (error) {
            console.error('Error sharing:', error);
            toast.error('Failed to share patient');
        } finally {
            setSharing(false);
        }
    };

    // Calculate stats
    const stats = {
        total: patients.length,
        shared: sharedCases.filter(c => c.status === 'shared').length,
        acknowledged: sharedCases.filter(c => c.status === 'acknowledged').length
    };

    if (loading) {
        return (
            <div className="critical-records-page">
                <div className="loading-state">Loading critical records...</div>
            </div>
        );
    }

    return (
        <div className="critical-records-page">
            {/* Header */}
            <header className="critical-page-header">
                <div className="critical-title-section">
                    <h1>
                        🚨 Critical Records
                        {stats.total > 0 && <span className="critical-badge">{stats.total}</span>}
                    </h1>
                    <p>Patients requiring immediate hospital attention</p>
                </div>
            </header>

            {/* Stats Row */}
            <div className="critical-stats-row">
                <div className="critical-stat-card pending">
                    <div className="stat-icon-circle">🚨</div>
                    <div className="stat-info">
                        <h3>{stats.total}</h3>
                        <span>Critical Patients</span>
                    </div>
                </div>
                <div className="critical-stat-card shared">
                    <div className="stat-icon-circle">📤</div>
                    <div className="stat-info">
                        <h3>{stats.shared}</h3>
                        <span>Pending Acknowledgement</span>
                    </div>
                </div>
                <div className="critical-stat-card acknowledged">
                    <div className="stat-icon-circle">✅</div>
                    <div className="stat-info">
                        <h3>{stats.acknowledged}</h3>
                        <span>Acknowledged</span>
                    </div>
                </div>
            </div>

            {/* Patient List */}
            <div className="critical-list-container">
                <div className="list-header">
                    <h2>Critical Patients</h2>
                    <button className="refresh-btn" onClick={fetchData}>
                        🔄 Refresh
                    </button>
                </div>

                <div className="critical-patients-list">
                    {patients.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">💚</span>
                            <h3>No Critical Patients</h3>
                            <p>All patients are stable. Critical patients will appear here automatically.</p>
                        </div>
                    ) : (
                        patients.map(patient => {
                            const caseStatus = getPatientCaseStatus(patient.id);

                            return (
                                <div key={patient.id} className="critical-patient-card">
                                    <div className="patient-avatar">
                                        {patient.name?.charAt(0) || 'P'}
                                    </div>
                                    <div className="patient-details">
                                        <div className="patient-name">{patient.name}</div>
                                        <div className="patient-meta">
                                            {patient.patient_id} • {patient.age} yrs • {patient.gender}
                                            {patient.blood_type && ` • ${patient.blood_type}`}
                                        </div>
                                    </div>
                                    <div className="patient-status-col">
                                        <div className={`status-pill ${caseStatus.status}`}>
                                            <span className="dot"></span>
                                            {caseStatus.label}
                                        </div>
                                        {caseStatus.hospital && (
                                            <div className="status-hospital">{caseStatus.hospital}</div>
                                        )}
                                    </div>
                                    {caseStatus.status === 'critical' && (
                                        <button
                                            className="share-btn"
                                            onClick={() => handleShareClick(patient)}
                                        >
                                            Share →
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Hospital Selection Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="hospital-select-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Select Hospital</h2>
                            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div className="modal-patient-info">
                            <h3>🚨 {selectedPatient?.name}</h3>
                            <p>{selectedPatient?.patient_id} • {selectedPatient?.age} yrs • Blood: {selectedPatient?.blood_type || 'Unknown'}</p>
                        </div>

                        <div className="hospital-list">
                            {loadingHospitals ? (
                                <div className="loading-hospitals">Loading nearby hospitals...</div>
                            ) : hospitals.length === 0 ? (
                                <div className="loading-hospitals">No hospitals available in this region</div>
                            ) : (
                                hospitals.map(hospital => (
                                    <div
                                        key={hospital.id}
                                        className={`hospital-option ${selectedHospital?.id === hospital.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedHospital(hospital)}
                                    >
                                        <div className="hospital-icon">🏥</div>
                                        <div className="hospital-info">
                                            <div className="hospital-header-row">
                                                <div className="hospital-name">{hospital.name}</div>
                                                <div className={`bed-badge ${hospital.available_beds === 0 ? 'full' : hospital.available_beds < 5 ? 'critical' : 'available'}`}>
                                                    🛏️ {hospital.available_beds} / {hospital.total_beds}
                                                </div>
                                            </div>
                                            <div className="hospital-meta">
                                                {hospital.city} • {hospital.facility_type?.replace('_', ' ')}
                                            </div>
                                            {hospital.specialities && hospital.specialities.length > 0 && (
                                                <div className="hospital-specs">
                                                    {hospital.specialities.slice(0, 3).map((spec, i) => (
                                                        <span key={i} className="spec-tag">{spec.replace('_', ' ')}</span>
                                                    ))}
                                                    {hospital.specialities.length > 3 && <span className="spec-more">+{hospital.specialities.length - 3}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="cancel-btn" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="confirm-share-btn"
                                onClick={handleConfirmShare}
                                disabled={!selectedHospital || sharing}
                            >
                                {sharing ? 'Sharing...' : `Share to ${selectedHospital?.name || 'Hospital'}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CriticalRecords;
