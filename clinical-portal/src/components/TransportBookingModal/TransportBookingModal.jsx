import { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import { X, MapPin, User, FileText, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import TransportProviderSelector from '../TransportProviderSelector/TransportProviderSelector';
import VehicleSelector from '../VehicleSelector/VehicleSelector';
import './TransportBookingModal.css';

export default function TransportBookingModal({
    isOpen,
    onClose,
    patientId = null,
    clinicRegion,
    onBookingCreated
}) {
    const [step, setStep] = useState(1); // 1: Provider, 2: Vehicle, 3: Details
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Form data
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patients, setPatients] = useState([]);

    const [bookingDetails, setBookingDetails] = useState({
        pickup_location: '',
        destination_location: '',
        urgency: 'critical',
        special_requirements: '',
        notes: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchPatients();
            if (patientId) {
                // Pre-select patient if provided
                fetchPatientDetails(patientId);
            }
        } else {
            // Reset on close
            resetForm();
        }
    }, [isOpen, patientId]);

    const fetchPatients = async () => {
        try {
            const response = await api.get('/patients');
            setPatients(response.data || []);
        } catch (err) {
            console.error('Error fetching patients:', err);
        }
    };

    const fetchPatientDetails = async (id) => {
        try {
            const response = await api.get(`/patients/${id}`);
            setSelectedPatient(response.data);
        } catch (err) {
            console.error('Error fetching patient:', err);
        }
    };

    const resetForm = () => {
        setStep(1);
        setSelectedProvider(null);
        setSelectedVehicle(null);
        setSelectedPatient(null);
        setBookingDetails({
            pickup_location: '',
            destination_location: '',
            urgency: 'critical',
            special_requirements: '',
            notes: ''
        });
        setError(null);
        setSuccess(false);
    };

    const handleProviderSelect = (provider) => {
        setSelectedProvider(provider);
        setSelectedVehicle(null); // Reset vehicle when provider changes
    };

    const handleVehicleSelect = (vehicle) => {
        setSelectedVehicle(vehicle);
    };

    const handlePatientSelect = (e) => {
        const patientId = e.target.value;
        const patient = patients.find(p => p.id === patientId);
        setSelectedPatient(patient);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setBookingDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = () => {
        if (step === 1 && selectedProvider) {
            setStep(2);
        } else if (step === 2 && selectedVehicle) {
            setStep(3);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedPatient || !selectedProvider || !selectedVehicle) {
            setError('Please complete all required fields');
            return;
        }

        if (!bookingDetails.pickup_location || !bookingDetails.destination_location) {
            setError('Pickup and destination locations are required');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const bookingData = {
                patient_id: selectedPatient.id,
                company_id: selectedProvider.id,
                vehicle_id: selectedVehicle.id,
                pickup_location: bookingDetails.pickup_location,
                destination_location: bookingDetails.destination_location,
                urgency: bookingDetails.urgency,
                special_requirements: bookingDetails.special_requirements || null,
                notes: bookingDetails.notes || null
            };

            const response = await api.post('/bookings', bookingData);

            setSuccess(true);
            setTimeout(() => {
                onBookingCreated?.(response.data);
                onClose();
            }, 2000);

        } catch (err) {
            console.error('Error creating booking:', err);
            setError(err.response?.data?.error || 'Failed to create booking');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="transport-booking-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h2>Book Transport</h2>
                    <button className="close-button" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="progress-steps">
                    <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                        <div className="step-number">1</div>
                        <span>Provider</span>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                        <div className="step-number">2</div>
                        <span>Vehicle</span>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step ${step >= 3 ? 'active' : ''}`}>
                        <div className="step-number">3</div>
                        <span>Details</span>
                    </div>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {/* Step 1: Provider Selection */}
                    {step === 1 && (
                        <TransportProviderSelector
                            clinicRegion={clinicRegion}
                            onSelectProvider={handleProviderSelect}
                            selectedProviderId={selectedProvider?.id}
                        />
                    )}

                    {/* Step 2: Vehicle Selection */}
                    {step === 2 && selectedProvider && (
                        <VehicleSelector
                            companyId={selectedProvider.id}
                            patientRiskScore={selectedPatient?.risk_score || 50}
                            onSelectVehicle={handleVehicleSelect}
                            selectedVehicleId={selectedVehicle?.id}
                        />
                    )}

                    {/* Step 3: Booking Details */}
                    {step === 3 && (
                        <form className="booking-details-form" onSubmit={handleSubmit}>
                            {/* Patient Selection */}
                            <div className="form-group">
                                <label>
                                    <User size={16} />
                                    Patient
                                </label>
                                <select
                                    value={selectedPatient?.id || ''}
                                    onChange={handlePatientSelect}
                                    required
                                    disabled={!!patientId}
                                >
                                    <option value="">Select patient...</option>
                                    {patients.map(patient => (
                                        <option key={patient.id} value={patient.id}>
                                            {patient.name} (ID: {patient.patient_id})
                                            {patient.risk_score && ` - Risk: ${patient.risk_score}/100`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Pickup Location */}
                            <div className="form-group">
                                <label>
                                    <MapPin size={16} />
                                    Pickup Location
                                </label>
                                <input
                                    type="text"
                                    name="pickup_location"
                                    value={bookingDetails.pickup_location}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Havelock Island Clinic"
                                    required
                                />
                            </div>

                            {/* Destination Location */}
                            <div className="form-group">
                                <label>
                                    <MapPin size={16} />
                                    Destination Location
                                </label>
                                <input
                                    type="text"
                                    name="destination_location"
                                    value={bookingDetails.destination_location}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Port Blair Hospital"
                                    required
                                />
                            </div>


                            {/* Special Requirements */}
                            <div className="form-group">
                                <label>
                                    <FileText size={16} />
                                    Special Requirements
                                </label>
                                <textarea
                                    name="special_requirements"
                                    value={bookingDetails.special_requirements}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Oxygen support required, wheelchair access"
                                    rows={3}
                                />
                            </div>

                            {/* Notes */}
                            <div className="form-group">
                                <label>
                                    <FileText size={16} />
                                    Additional Notes
                                </label>
                                <textarea
                                    name="notes"
                                    value={bookingDetails.notes}
                                    onChange={handleInputChange}
                                    placeholder="Any additional information..."
                                    rows={3}
                                />
                            </div>
                        </form>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="error-message">
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="success-message">
                            <CheckCircle2 size={16} />
                            Booking created successfully!
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    {step > 1 && (
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleBack}
                            disabled={loading}
                        >
                            Back
                        </button>
                    )}

                    {step < 3 ? (
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleNext}
                            disabled={
                                (step === 1 && !selectedProvider) ||
                                (step === 2 && !selectedVehicle)
                            }
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSubmit}
                            disabled={loading || success}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="spinner" size={16} />
                                    Creating Booking...
                                </>
                            ) : (
                                'Create Booking'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
