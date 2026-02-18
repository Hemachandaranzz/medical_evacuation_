import { useState, useEffect } from 'react';
import api from '../../services/api';
import './LocationCapture.css';

/**
 * LocationCapture for Hospital Portal — detects missing coordinates and prompts for capture.
 * Receives the hospital object from AuthContext to check existing coordinates.
 */
export default function LocationCapture({ hospital, onSaved }) {
    const [show, setShow] = useState(false);
    const [mode, setMode] = useState(null); // 'auto' | 'manual'
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Show the banner if hospital has no coordinates saved
        if (hospital && (!hospital.latitude || !hospital.longitude)) {
            setShow(true);
        }
    }, [hospital]);

    const handleAutoLocate = () => {
        setMode('auto');
        setError(null);
        setLoading(true);

        if (!navigator.geolocation) {
            setError('Geolocation is not supported. Please enter manually.');
            setMode('manual');
            setLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLatitude(position.coords.latitude.toFixed(7));
                setLongitude(position.coords.longitude.toFixed(7));
                setLoading(false);
            },
            () => {
                setError('Could not get location. Please enter coordinates manually.');
                setMode('manual');
                setLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleSave = async () => {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            setError('Please enter valid coordinates (lat: -90 to 90, lng: -180 to 180)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await api.put('/location/hospital', { latitude: lat, longitude: lng });
            setSuccess(true);
            setTimeout(() => {
                setShow(false);
                onSaved?.({ latitude: lat, longitude: lng });
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to save location');
        } finally {
            setLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="location-capture-banner">
            <div className="location-capture-content">
                <div className="location-capture-header">
                    <span className="location-icon">📍</span>
                    <div>
                        <h4>Set Hospital Location</h4>
                        <p>Enable live maps for incoming patient tracking</p>
                    </div>
                    <button className="location-dismiss-btn" onClick={() => setShow(false)}>✕</button>
                </div>

                {success ? (
                    <div className="location-success">
                        <span>✅ Location saved successfully!</span>
                    </div>
                ) : !mode ? (
                    <div className="location-options">
                        <button className="location-option-btn primary" onClick={handleAutoLocate}>
                            🎯 Use My Current Location
                        </button>
                        <button className="location-option-btn secondary" onClick={() => setMode('manual')}>
                            📍 Enter Manually
                        </button>
                    </div>
                ) : (
                    <div className="location-form">
                        <div className="location-inputs">
                            <div className="location-input-group">
                                <label>Latitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={latitude}
                                    onChange={(e) => setLatitude(e.target.value)}
                                    placeholder="e.g. 11.6234"
                                    disabled={loading}
                                />
                            </div>
                            <div className="location-input-group">
                                <label>Longitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={longitude}
                                    onChange={(e) => setLongitude(e.target.value)}
                                    placeholder="e.g. 92.7265"
                                    disabled={loading}
                                />
                            </div>
                        </div>
                        <div className="location-actions">
                            <button
                                className="location-save-btn"
                                onClick={handleSave}
                                disabled={loading || !latitude || !longitude}
                            >
                                {loading ? 'Saving...' : 'Save Location'}
                            </button>
                            <button className="location-cancel-btn" onClick={() => { setMode(null); setError(null); }}>
                                Back
                            </button>
                        </div>
                    </div>
                )}

                {error && <p className="location-error">{error}</p>}
            </div>
        </div>
    );
}
