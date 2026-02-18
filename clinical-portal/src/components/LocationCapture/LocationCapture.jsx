import { useState, useEffect } from 'react';
import { api } from '../../services/apiClient';
import { MapPin, Crosshair, X, Check } from 'lucide-react';
import './LocationCapture.css';

/**
 * LocationCapture — Prompts facility staff to share coordinates.
 * Renders nothing if coordinates are already saved.
 * 
 * Props:
 *   - endpoint: API endpoint to PUT coordinates to (e.g., '/location/clinic')
 *   - facilityId: The clinic/hospital ID to check for existing coords
 *   - facilityTable: 'clinics' or 'hospitals'
 *   - onSaved: callback after coords are saved
 */
export default function LocationCapture({ endpoint = '/location/clinic', checkEndpoint = '/clinics/me', onSaved }) {
    const [show, setShow] = useState(false);
    const [mode, setMode] = useState(null); // 'auto' | 'manual'
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        checkExistingCoords();
    }, []);

    const checkExistingCoords = async () => {
        try {
            const response = await api.get(checkEndpoint);
            const facility = response.data;
            if (!facility?.latitude || !facility?.longitude) {
                setShow(true);
            }
        } catch (err) {
            // If facility not found, don't show the prompt
            console.log('LocationCapture: Could not check coords', err.message);
        }
    };

    const handleAutoLocate = () => {
        setMode('auto');
        setError(null);
        setLoading(true);

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser. Please enter manually.');
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
            (err) => {
                setError('Could not get your location. Please enter coordinates manually.');
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
            await api.put(endpoint, { latitude: lat, longitude: lng });
            setSuccess(true);
            setTimeout(() => {
                setShow(false);
                onSaved?.({ latitude: lat, longitude: lng });
            }, 1500);
        } catch (err) {
            setError(err.message || 'Failed to save location');
        } finally {
            setLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="location-capture-banner">
            <div className="location-capture-content">
                <div className="location-capture-header">
                    <MapPin size={20} className="location-icon" />
                    <div>
                        <h4>Set Your Facility Location</h4>
                        <p>Enable live maps for transport tracking</p>
                    </div>
                    <button className="location-dismiss-btn" onClick={() => setShow(false)}>
                        <X size={16} />
                    </button>
                </div>

                {success ? (
                    <div className="location-success">
                        <Check size={20} />
                        <span>Location saved successfully!</span>
                    </div>
                ) : !mode ? (
                    <div className="location-options">
                        <button className="location-option-btn primary" onClick={handleAutoLocate}>
                            <Crosshair size={16} />
                            Use My Current Location
                        </button>
                        <button className="location-option-btn secondary" onClick={() => setMode('manual')}>
                            <MapPin size={16} />
                            Enter Manually
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
