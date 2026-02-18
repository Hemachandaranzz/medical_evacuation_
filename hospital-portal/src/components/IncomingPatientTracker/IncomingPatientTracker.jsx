import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { socket } from '../../services/socketClient';
import './IncomingPatientTracker.css';

/**
 * IncomingPatientTracker — Hospital-centric component showing incoming driver positions
 * on a live map with ETA countdown.
 * 
 * Props:
 *   - assignmentId: transport_assignment ID
 *   - patientName: patient name for display
 *   - onClose: callback to hide
 */
export default function IncomingPatientTracker({ assignmentId, patientName, onClose }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const [mapData, setMapData] = useState(null);
    const [driverPos, setDriverPos] = useState(null);
    const [eta, setEta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [leafletLoaded, setLeafletLoaded] = useState(false);

    // Dynamically load Leaflet
    useEffect(() => {
        if (window.L) { setLeafletLoaded(true); return; }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => setLeafletLoaded(true);
        document.head.appendChild(script);
    }, []);

    // Fetch map data
    useEffect(() => {
        const fetch = async () => {
            try {
                const { data } = await api.get(`/location/booking/${assignmentId}`);
                setMapData(data);
                if (data.driver) setDriverPos({ lat: data.driver.latitude, lng: data.driver.longitude });
                if (data.eta) setEta(data.eta);
            } catch (err) {
                console.error('IncomingPatientTracker fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [assignmentId]);

    // Socket subscription
    useEffect(() => {
        const sock = socket.connect();
        sock.emit('join_booking_room', { bookingId: assignmentId });

        const handleUpdate = (payload) => {
            if (payload.bookingId === assignmentId) {
                setDriverPos({ lat: payload.driverLat, lng: payload.driverLng });
                if (mapData?.dropoff?.latitude) {
                    const d = haversine(payload.driverLat, payload.driverLng, mapData.dropoff.latitude, mapData.dropoff.longitude);
                    setEta({ distanceKm: Math.round(d * 10) / 10, minutesRemaining: Math.round((d / 40) * 60) });
                }
            }
        };

        sock.on('driver:location_update', handleUpdate);
        return () => {
            sock.emit('leave_booking_room', { bookingId: assignmentId });
            sock.off('driver:location_update', handleUpdate);
        };
    }, [assignmentId, mapData]);

    // Initialize Leaflet map
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current || !mapData) return;
        const L = window.L;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([11.6, 92.7], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM',
                maxZoom: 18
            }).addTo(mapInstanceRef.current);
        }

        const map = mapInstanceRef.current;
        const bounds = [];

        // Hospital pin (blue)
        if (mapData.dropoff?.latitude) {
            const icon = L.divIcon({
                className: 'custom-marker',
                html: '<div class="marker-dot hospital">🏥</div>',
                iconSize: [24, 24], iconAnchor: [12, 12]
            });
            L.marker([mapData.dropoff.latitude, mapData.dropoff.longitude], { icon })
                .addTo(map)
                .bindPopup(`<b>Hospital:</b> ${mapData.dropoff.name || 'This Hospital'}`);
            bounds.push([mapData.dropoff.latitude, mapData.dropoff.longitude]);
        }

        // Clinic pin (green)
        if (mapData.pickup?.latitude) {
            const icon = L.divIcon({
                className: 'custom-marker',
                html: '<div class="marker-dot clinic">🏥</div>',
                iconSize: [24, 24], iconAnchor: [12, 12]
            });
            L.marker([mapData.pickup.latitude, mapData.pickup.longitude], { icon })
                .addTo(map)
                .bindPopup(`<b>Pickup:</b> ${mapData.pickup.name || 'Clinic'}`);
            bounds.push([mapData.pickup.latitude, mapData.pickup.longitude]);
        }

        if (bounds.length >= 2) map.fitBounds(bounds, { padding: [40, 40] });
        else if (bounds.length === 1) map.setView(bounds[0], 13);

        return () => {
            if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
        };
    }, [leafletLoaded, mapData]);

    // Update driver marker
    useEffect(() => {
        if (!leafletLoaded || !mapInstanceRef.current || !driverPos) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        const icon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="marker-dot driver-pulse">🚗</div>',
            iconSize: [28, 28], iconAnchor: [14, 14]
        });

        if (driverMarkerRef.current) {
            driverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
        } else {
            driverMarkerRef.current = L.marker([driverPos.lat, driverPos.lng], { icon }).addTo(map);
        }
    }, [leafletLoaded, driverPos]);

    if (loading) return <div className="tracker-loading">Loading tracker...</div>;

    return (
        <div className="incoming-tracker">
            <div className="tracker-header">
                <div className="tracker-title">
                    <span>🚗 Incoming: {patientName || 'Patient'}</span>
                    {eta && (
                        <span className={`eta-pill ${getETAClass(eta.minutesRemaining)}`}>
                            ⏱ {eta.minutesRemaining} min • {eta.distanceKm} km
                        </span>
                    )}
                </div>
                {onClose && <button className="tracker-close" onClick={onClose}>✕</button>}
            </div>
            <div ref={mapRef} className="tracker-map" />
            {!driverPos && <div className="tracker-waiting">Waiting for driver GPS signal...</div>}
        </div>
    );
}

function getETAClass(min) {
    if (min < 10) return 'eta-close';
    if (min < 20) return 'eta-mid';
    return 'eta-far';
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
