import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './MapView.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * MapView — Delivery-app-like map for drivers during active trips.
 * Shows pickup/dropoff pins, driver's live GPS, route overview, and "Open in Maps" link.
 * 
 * Props:
 *   - assignment: the transport_assignment object (must have id)
 *   - driver: the current driver object
 *   - onClose: callback to close the map view
 */
export default function MapView({ assignment, driver, onClose }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const [mapData, setMapData] = useState(null);
    const [driverPos, setDriverPos] = useState(null);
    const [eta, setEta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const [pingActive, setPingActive] = useState(false);
    const pingIntervalRef = useRef(null);

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

    // Fetch map data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(`${API_URL}/location/booking/${assignment.id}`, {
                    headers: { Authorization: `Bearer ${session?.access_token}` }
                });
                const data = await res.json();
                setMapData(data);
                if (data.driver) setDriverPos({ lat: data.driver.latitude, lng: data.driver.longitude });
                if (data.eta) setEta(data.eta);
            } catch (err) {
                console.error('MapView fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [assignment.id]);

    // GPS Ping loop
    const sendPing = useCallback(async (position) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/location/driver/ping`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    booking_id: assignment.id,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    heading: position.coords.heading,
                    speed_kmh: position.coords.speed ? position.coords.speed * 3.6 : null
                })
            });
            if (res.ok) {
                setDriverPos({ lat: position.coords.latitude, lng: position.coords.longitude });
            }
        } catch (err) {
            console.error('Ping failed:', err);
        }
    }, [assignment.id]);

    useEffect(() => {
        if (!navigator.geolocation) return;
        setPingActive(true);

        const ping = () => {
            navigator.geolocation.getCurrentPosition(
                sendPing,
                (err) => console.warn('GPS error:', err.message),
                { enableHighAccuracy: true, timeout: 8000 }
            );
        };

        // Initial ping
        ping();
        // Ping every 10 seconds
        pingIntervalRef.current = setInterval(ping, 10000);

        return () => {
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            setPingActive(false);
        };
    }, [sendPing]);

    // Initialize map
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current || !mapData) return;
        const L = window.L;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([11.6, 92.7], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM', maxZoom: 18
            }).addTo(mapInstanceRef.current);
        }

        const map = mapInstanceRef.current;
        const bounds = [];

        if (mapData.pickup?.latitude) {
            const icon = L.divIcon({ className: 'map-marker', html: '<div class="pin pickup">P</div>', iconSize: [28, 28], iconAnchor: [14, 28] });
            L.marker([mapData.pickup.latitude, mapData.pickup.longitude], { icon })
                .addTo(map).bindPopup(`<b>Pickup:</b> ${mapData.pickup.name}`);
            bounds.push([mapData.pickup.latitude, mapData.pickup.longitude]);
        }

        if (mapData.dropoff?.latitude) {
            const icon = L.divIcon({ className: 'map-marker', html: '<div class="pin dropoff">H</div>', iconSize: [28, 28], iconAnchor: [14, 28] });
            L.marker([mapData.dropoff.latitude, mapData.dropoff.longitude], { icon })
                .addTo(map).bindPopup(`<b>Hospital:</b> ${mapData.dropoff.name}`);
            bounds.push([mapData.dropoff.latitude, mapData.dropoff.longitude]);
        }

        if (bounds.length >= 2) map.fitBounds(bounds, { padding: [50, 50] });
        else if (bounds.length === 1) map.setView(bounds[0], 13);

        return () => {
            if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
        };
    }, [leafletLoaded, mapData]);

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

        // Also recalculate ETA
        if (mapData?.dropoff?.latitude) {
            const d = haversine(driverPos.lat, driverPos.lng, mapData.dropoff.latitude, mapData.dropoff.longitude);
            setEta({ distanceKm: Math.round(d * 10) / 10, minutesRemaining: Math.round((d / 40) * 60) });
        }
    }, [leafletLoaded, driverPos]);

    const openInMaps = () => {
        if (!mapData?.dropoff?.latitude) return;
        const dest = `${mapData.dropoff.latitude},${mapData.dropoff.longitude}`;
        // Works on Android and iOS
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank');
    };

    if (loading) return <div className="map-view-loading">Loading map... 🗺️</div>;

    return (
        <div className="map-view-container">
            <div className="map-view-topbar">
                <button className="map-back-btn" onClick={onClose}>← Back</button>
                <div className="map-view-status">
                    {pingActive && <span className="gps-dot">●</span>}
                    <span>Live Tracking</span>
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

                {mapData?.assignment && (
                    <div className="map-trip-info">
                        <span>Status: <strong>{mapData.assignment.status?.replace(/_/g, ' ')}</strong></span>
                    </div>
                )}
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
