import { useState } from 'react'
import { supabase, getCurrentUser, signOut } from '../../lib/supabase'
import { Building2, Truck, User, CheckCircle, LogOut } from 'lucide-react'
import './OnboardingWizard.css'

// Operating locations
const operatingLocations = [
    'Ooty',
    'Kodaikanal',
    'Andaman & Nicobar',
    'Lakshadweep'
]

// Country codes list
const countryCodes = [
    { code: '+91', country: 'India' },
    { code: '+1', country: 'USA/Canada' },
    { code: '+44', country: 'UK' },
    { code: '+61', country: 'Australia' },
    { code: '+971', country: 'UAE' },
    { code: '+65', country: 'Singapore' },
    { code: '+60', country: 'Malaysia' },
    { code: '+81', country: 'Japan' },
    { code: '+49', country: 'Germany' },
    { code: '+33', country: 'France' },
    { code: '+39', country: 'Italy' },
    { code: '+86', country: 'China' },
    { code: '+82', country: 'South Korea' },
    { code: '+55', country: 'Brazil' },
    { code: '+27', country: 'South Africa' },
    { code: '+234', country: 'Nigeria' },
    { code: '+254', country: 'Kenya' },
    { code: '+966', country: 'Saudi Arabia' },
    { code: '+7', country: 'Russia' },
    { code: '+52', country: 'Mexico' }
]

export default function OnboardingWizard({ onComplete }) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [errors, setErrors] = useState({})
    const [formData, setFormData] = useState({
        companyName: '',
        contactEmail: '',
        countryCode: '+91',
        contactPhone: '',
        operatingLocation: '',
        businessRegistrationNumber: '',
        operatingLicense: '',
        coverageRadius: 50
    })

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }))
        }
    }

    // Validation functions
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const validatePhone = (phone) => {
        // Phone should be 6-15 digits only (without country code)
        const phoneRegex = /^\d{6,15}$/
        return phoneRegex.test(phone.replace(/\s/g, ''))
    }

    const validateStep1 = () => {
        const newErrors = {}

        if (!formData.companyName.trim()) {
            newErrors.companyName = 'Company name is required'
        }

        if (!formData.contactEmail.trim()) {
            newErrors.contactEmail = 'Email is required'
        } else if (!validateEmail(formData.contactEmail)) {
            newErrors.contactEmail = 'Please enter a valid email address'
        }

        if (!formData.contactPhone.trim()) {
            newErrors.contactPhone = 'Phone number is required'
        } else if (!validatePhone(formData.contactPhone)) {
            newErrors.contactPhone = 'Please enter a valid phone number (6-15 digits)'
        }

        if (!formData.operatingLocation) {
            newErrors.operatingLocation = 'Operating location is required'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleNextStep = () => {
        if (validateStep1()) {
            setStep(2)
        }
    }

    const handleSubmit = async () => {
        setLoading(true)
        try {
            const user = await getCurrentUser()

            // Combine country code with phone number
            const fullPhoneNumber = `${formData.countryCode} ${formData.contactPhone}`

            const { data, error } = await supabase
                .from('transport_companies')
                .insert([
                    {
                        user_id: user.id,
                        company_name: formData.companyName,
                        contact_email: formData.contactEmail,
                        contact_phone: fullPhoneNumber,
                        operating_location: formData.operatingLocation,
                        business_registration_number: formData.businessRegistrationNumber,
                        operating_license: formData.operatingLicense,
                        service_coverage_radius_km: formData.coverageRadius,
                        is_verified: false,
                        is_active: true
                    }
                ])
                .select()
                .single()

            if (error) throw error

            alert('Company profile created successfully!')
            onComplete()
        } catch (error) {
            console.error('Error creating company:', error)
            alert('Error: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="onboarding-page">
            <div className="onboarding-container">
                <div className="onboarding-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                        <div>
                            <h1>Welcome to Transport Provider Portal</h1>
                            <p>Let's set up your company profile</p>
                        </div>
                        <button
                            onClick={() => signOut()}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#64748b',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px'
                            }}
                        >
                            <LogOut size={18} />
                            Sign Out
                        </button>
                    </div>
                </div>

                <div className="progress-bar">
                    <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                        <Building2 size={24} />
                        <span>Company Info</span>
                    </div>
                    <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                        <Truck size={24} />
                        <span>Service Details</span>
                    </div>
                    <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
                        <CheckCircle size={24} />
                        <span>Complete</span>
                    </div>
                </div>

                <div className="onboarding-content">
                    {step === 1 && (
                        <div className="step-content">
                            <h2>Company Information</h2>
                            <div className={`form-group ${errors.companyName ? 'has-error' : ''}`}>
                                <label htmlFor="companyName">Company Name *</label>
                                <input
                                    id="companyName"
                                    type="text"
                                    value={formData.companyName}
                                    onChange={(e) => updateField('companyName', e.target.value)}
                                    placeholder="ABC Emergency Transport"
                                    className={errors.companyName ? 'input-error' : ''}
                                />
                                {errors.companyName && (
                                    <span className="error-message">{errors.companyName}</span>
                                )}
                            </div>

                            <div className={`form-group ${errors.contactEmail ? 'has-error' : ''}`}>
                                <label htmlFor="contactEmail">Contact Email *</label>
                                <input
                                    id="contactEmail"
                                    type="email"
                                    value={formData.contactEmail}
                                    onChange={(e) => updateField('contactEmail', e.target.value)}
                                    placeholder="contact@company.com"
                                    className={errors.contactEmail ? 'input-error' : ''}
                                />
                                {errors.contactEmail && (
                                    <span className="error-message">{errors.contactEmail}</span>
                                )}
                            </div>

                            <div className={`form-group ${errors.contactPhone ? 'has-error' : ''}`}>
                                <label htmlFor="contactPhone">Contact Phone *</label>
                                <div className="phone-input-group">
                                    <select
                                        className="country-code-select"
                                        value={formData.countryCode}
                                        onChange={(e) => updateField('countryCode', e.target.value)}
                                    >
                                        {countryCodes.map((cc) => (
                                            <option key={cc.code} value={cc.code}>
                                                {cc.code} ({cc.country})
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        id="contactPhone"
                                        type="tel"
                                        value={formData.contactPhone}
                                        onChange={(e) => updateField('contactPhone', e.target.value)}
                                        placeholder="1234567890"
                                        className={errors.contactPhone ? 'input-error' : ''}
                                    />
                                </div>
                                {errors.contactPhone && (
                                    <span className="error-message">{errors.contactPhone}</span>
                                )}
                            </div>

                            <div className={`form-group ${errors.operatingLocation ? 'has-error' : ''}`}>
                                <label htmlFor="operatingLocation">Operating Location *</label>
                                <select
                                    id="operatingLocation"
                                    value={formData.operatingLocation}
                                    onChange={(e) => updateField('operatingLocation', e.target.value)}
                                    className={errors.operatingLocation ? 'input-error' : ''}
                                >
                                    <option value="">Select your operating location</option>
                                    {operatingLocations.map((location) => (
                                        <option key={location} value={location}>
                                            {location}
                                        </option>
                                    ))}
                                </select>
                                {errors.operatingLocation && (
                                    <span className="error-message">{errors.operatingLocation}</span>
                                )}
                            </div>

                            <button
                                onClick={handleNextStep}
                                className="btn-primary"
                            >
                                Next: Service Details →
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="step-content">
                            <h2>Service Details</h2>

                            <div className="form-group">
                                <label htmlFor="businessReg">Business Registration Number</label>
                                <input
                                    id="businessReg"
                                    type="text"
                                    value={formData.businessRegistrationNumber}
                                    onChange={(e) => updateField('businessRegistrationNumber', e.target.value)}
                                    placeholder="Optional"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="operatingLicense">Operating License</label>
                                <input
                                    id="operatingLicense"
                                    type="text"
                                    value={formData.operatingLicense}
                                    onChange={(e) => updateField('operatingLicense', e.target.value)}
                                    placeholder="Optional"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="coverageRadius">Service Coverage Radius (km)</label>
                                <input
                                    id="coverageRadius"
                                    type="number"
                                    min="10"
                                    max="500"
                                    value={formData.coverageRadius}
                                    onChange={(e) => updateField('coverageRadius', parseInt(e.target.value))}
                                />
                                <small className="text-gray">How far can your fleet travel for emergency pickups</small>
                            </div>

                            <div className="button-group">
                                <button onClick={() => setStep(1)} className="btn-secondary">
                                    ← Back
                                </button>
                                <button onClick={() => setStep(3)} className="btn-primary">
                                    Review & Submit →
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="step-content">
                            <h2>Review Your Information</h2>

                            <div className="review-card">
                                <h3>Company Information</h3>
                                <div className="review-item">
                                    <span className="label">Company Name:</span>
                                    <span className="value">{formData.companyName}</span>
                                </div>
                                <div className="review-item">
                                    <span className="label">Email:</span>
                                    <span className="value">{formData.contactEmail}</span>
                                </div>
                                <div className="review-item">
                                    <span className="label">Phone:</span>
                                    <span className="value">{formData.countryCode} {formData.contactPhone}</span>
                                </div>
                            </div>

                            <div className="review-card">
                                <h3>Service Details</h3>
                                <div className="review-item">
                                    <span className="label">Coverage Radius:</span>
                                    <span className="value">{formData.coverageRadius} km</span>
                                </div>
                                {formData.businessRegistrationNumber && (
                                    <div className="review-item">
                                        <span className="label">Business Registration:</span>
                                        <span className="value">{formData.businessRegistrationNumber}</span>
                                    </div>
                                )}
                                {formData.operatingLicense && (
                                    <div className="review-item">
                                        <span className="label">Operating License:</span>
                                        <span className="value">{formData.operatingLicense}</span>
                                    </div>
                                )}
                            </div>

                            <div className="button-group">
                                <button onClick={() => setStep(2)} className="btn-secondary" disabled={loading}>
                                    ← Back
                                </button>
                                <button onClick={handleSubmit} className="btn-success" disabled={loading}>
                                    {loading ? 'Creating...' : 'Complete Setup ✓'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
