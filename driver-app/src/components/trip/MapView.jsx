import { useState, useEffect, useRef } from 'react';
import './MapView.css';

/**
 * MapView — Delivery-app-like map for drivers.
 * Now receives location data as props from ActiveTrip.
 */
export default function MapView({ assignment, driver, driverPos, pickup, dropoff, onClose }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const [eta, setEta] = useState(null);

    // Load Leaflet dynamically
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

    // Initialize map
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current) return;
        const L = window.L;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([11.6, 92.7], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM', maxZoom: 18
            }).addTo(mapInstanceRef.current);
        }

        const map = mapInstanceRef.current;
        const bounds = [];

        // Cleanup existing markers (except driver)
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker && layer !== driverMarkerRef.current) {
                map.removeLayer(layer);
            }
        });

        if (pickup?.latitude) {
            const icon = L.divIcon({ className: 'map-marker', html: '<div class="pin pickup">P</div>', iconSize: [28, 28], iconAnchor: [14, 28] });
            L.marker([pickup.latitude, pickup.longitude], { icon })
                .addTo(map).bindPopup(`<b>Pickup:</b> ${pickup.name || 'Pickup'}`);
            bounds.push([pickup.latitude, pickup.longitude]);
        }

        if (dropoff?.latitude) {
            const icon = L.divIcon({ className: 'map-marker', html: '<div class="pin dropoff">H</div>', iconSize: [28, 28], iconAnchor: [14, 28] });
            L.marker([dropoff.latitude, dropoff.longitude], { icon })
                .addTo(map).bindPopup(`<b>Hospital:</b> ${dropoff.name || 'Hospital'}`);
            bounds.push([dropoff.latitude, dropoff.longitude]);
        }

        if (bounds.length >= 2) map.fitBounds(bounds, { padding: [50, 50] });
        else if (bounds.length === 1) map.setView(bounds[0], 13);

        // Note: we don't destroy the map on unmount to keep state? 
        // No, we should clean up if we want a fresh map on re-open.
        // But the component unmounts when onClose is called. So:
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                driverMarkerRef.current = null;
            }
        };
    }, [leafletLoaded, pickup, dropoff]);

    // Update driver marker
    useEffect(() => {
        if (!leafletLoaded || !mapInstanceRef.current || !driverPos) return;
        const L = window.L;

        const icon = L.divIcon({
            className: 'map-marker',
            html: '<div class="pin driver">🚗</div>',
            iconSize: [32, 32], iconAnchor: [16, 16]
        });

        if (driverMarkerRef.current) {
            driverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
        } else {
            driverMarkerRef.current = L.marker([driverPos.lat, driverPos.lng], { icon })
                .addTo(mapInstanceRef.current)
                .bindPopup('You are here');
        }

        // Calculate ETA
        if (dropoff?.latitude) {
            const d = haversine(driverPos.lat, driverPos.lng, dropoff.latitude, dropoff.longitude);
            setEta({ distanceKm: Math.round(d * 10) / 10, minutesRemaining: Math.round((d / 40) * 60) });
        }
    }, [leafletLoaded, driverPos, dropoff]);

    const openInMaps = () => {
        if (!dropoff?.latitude) return;
        const dest = `${dropoff.latitude},${dropoff.longitude}`;
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank');
    };

    if (!leafletLoaded) return <div className="map-view-loading">Loading map... 🗺️</div>;

    return (
        <div className="map-view-container">
            <div className="map-view-topbar">
                <button className="map-back-btn" onClick={onClose}>← Back</button>
                <div className="map-view-status">
                    {driverPos && <span className="gps-dot">●</span>}
                    <span>{driverPos ? 'Live Tracking' : 'Waiting for GPS...'}</span>
                </div>
            </div>

            <div ref={mapRef} className="map-view-canvas" />

            <div className="map-view-bottom">
                {eta && (
                    <div className="eta-display">
                        <span className="eta-time">{eta.minutesRemaining} min</span>
                        <span className="eta-distance">{eta.distanceKm} km to hospital</span>
                    </div>
                )}

                <div className="map-view-actions">
                    <button className="open-maps-btn" onClick={openInMaps}>
                        📍 Open in Google Maps
                    </button>
                </div>

                <div className="map-trip-info">
                    <span>Status: <strong>{assignment.current_status?.replace(/_/g, ' ')}</strong></span>
                </div>
            </div>
        </div>
    );
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
