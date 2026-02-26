import { useState, useEffect, useRef } from 'react';
import { socket } from '../../services/socketClient';
import { supabase } from '../../services/supabaseClient';
import './LiveMap.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * LiveMap — Hospital Portal version.
 * Shows drivers transporting patients to THIS hospital (or global view if simplified).
 */
export default function LiveMap() {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({});
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leafletLoaded, setLeafletLoaded] = useState(false);

    // Load Leaflet
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

    // Fetch initial data
    useEffect(() => {
        const fetchDrivers = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                // Using the same endpoint for now, assuming role-based access will be handled or is open
                const res = await fetch(`${API_URL}/location/active-drivers`, {
                    headers: { Authorization: `Bearer ${session?.access_token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setDrivers(data.drivers || []);
                } else {
                    const text = await res.text();
                    console.error("Failed to fetch drivers", text);
                    setError(`Failed to load drivers: ${res.statusText}`);
                }
            } catch (err) {
                console.error('LiveMap fetch error:', err);
                setError('Network error loading map data');
            } finally {
                setLoading(false);
            }
        };
        fetchDrivers();
    }, []);

    // Subscribe to real-time updates
    useEffect(() => {
        const sock = socket.connect();
        // Hospital users can join the same admin map room for now to see global traffic,
        // or we could filter client-side. Using admin room for simplicity/parity.
        sock.emit('join_admin_live_map');

        const handleUpdate = (payload) => {
            setDrivers(prev => {
                const idx = prev.findIndex(d => d.assignmentId === payload.bookingId);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = {
                        ...updated[idx],
                        driver: {
                            ...updated[idx].driver,
                            location: {
                                latitude: payload.driverLat,
                                longitude: payload.driverLng,
                                heading: payload.heading,
                                speed_kmh: payload.speed
                            }
                        }
                    };
                    return updated;
                }
                return prev;
            });
        };

        sock.on('driver:location_update', handleUpdate);
        return () => {
            sock.emit('leave_admin_live_map');
            sock.off('driver:location_update', handleUpdate);
        };
    }, []);

    // Init map
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current) return;
        const L = window.L;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([11.6, 92.7], 9);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM', maxZoom: 18
            }).addTo(mapInstanceRef.current);
        }

        return () => {
            if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
        };
    }, [leafletLoaded]);

    // Update markers
    useEffect(() => {
        if (!leafletLoaded || !mapInstanceRef.current) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        drivers.forEach(d => {
            const loc = d.driver?.location;
            if (!loc) return;

            const icon = L.divIcon({
                className: 'hospital-marker',
                html: `<div class="hospital-driver-dot" style="background:#ef5350">🚑</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            const popup = `
                <b>${d.driver.name}</b><br/>
                Status: ${d.status?.replace(/_/g, ' ')}<br/>
                ${d.eta ? `ETA: ${d.eta.minutesRemaining} min` : ''}
            `;

            if (markersRef.current[d.assignmentId]) {
                markersRef.current[d.assignmentId].setLatLng([loc.latitude, loc.longitude]);
                markersRef.current[d.assignmentId].setPopupContent(popup);
            } else {
                markersRef.current[d.assignmentId] = L.marker([loc.latitude, loc.longitude], { icon })
                    .addTo(map)
                    .bindPopup(popup);
            }
        });
    }, [leafletLoaded, drivers]);

    if (loading) {
        return (
            <div className="livemap-loading">
                <div className="spinner"></div>
                <p>Loading live map...</p>
            </div>
        );
    }

    return (
        <div className="livemap-page">
            <div className="livemap-header">
                <h1>🚑 Incoming Ambulances</h1>
                <div className="livemap-stats">
                    <span className="stat-pill">{drivers.length} active</span>
                </div>
            </div>
            <div ref={mapRef} className="livemap-canvas" />
            {error && (
                <div className="livemap-error">
                    <p>⚠️ {error}</p>
                </div>
            )}

            {!error && drivers.length === 0 && (
                <div className="livemap-empty">
                    <p>No active ambulances tracked.</p>
                </div>
            )}
        </div>
    );
}
