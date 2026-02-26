import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { socket } from '../../services/socketClient';
import { MapPin, Navigation, Clock } from 'lucide-react';
import './LiveDriverMap.css';

/**
 * LiveDriverMap — Shows pickup, dropoff, and live driver position on a map.
 * Uses Leaflet for rendering. Falls back to a text-based ETA display if
 * Leaflet is not available.
 * 
 * Props:
 *   - bookingId: transport_assignment ID to track
 *   - onClose: callback to hide the map
 */
export default function LiveDriverMap({ bookingId, onClose }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const [mapData, setMapData] = useState(null);
    const [driverPos, setDriverPos] = useState(null);
    const [eta, setEta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leafletLoaded, setLeafletLoaded] = useState(false);

    // Dynamically load Leaflet CSS + JS
    useEffect(() => {
        const loadLeaflet = async () => {
            // Check if already loaded
            if (window.L) {
                setLeafletLoaded(true);
                return;
            }

            // Load CSS
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);

            // Load JS
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => setLeafletLoaded(true);
            script.onerror = () => setError('Failed to load map library');
            document.head.appendChild(script);
        };

        loadLeaflet();
    }, []);

    // Fetch initial map data
    useEffect(() => {
        const fetchMapData = async () => {
            try {
                const response = await api.get(`/location/booking/${bookingId}`);
                const data = response.data;
                setMapData(data);
                if (data.driver) {
                    setDriverPos({ lat: data.driver.latitude, lng: data.driver.longitude });
                }
                if (data.eta) {
                    setEta(data.eta);
                }
            } catch (err) {
                setError('Failed to load map data');
                console.error('LiveDriverMap fetch error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchMapData();
    }, [bookingId]);

    // Subscribe to live driver updates
    useEffect(() => {
        const sock = socket.connect();
        sock.emit('join_booking_room', { bookingId });

        const handleUpdate = (payload) => {
            if (payload.bookingId === bookingId) {
                setDriverPos({ lat: payload.driverLat, lng: payload.driverLng });
                // Recalculate simple ETA if we have a dropoff
                if (mapData?.dropoff?.latitude && mapData?.dropoff?.longitude) {
                    const dist = haversine(payload.driverLat, payload.driverLng, mapData.dropoff.latitude, mapData.dropoff.longitude);
                    setEta({
                        distanceKm: Math.round(dist * 10) / 10,
                        minutesRemaining: Math.round((dist / 40) * 60)
                    });
                }
            }
        };

        sock.on('driver:location_update', handleUpdate);

        return () => {
            sock.emit('leave_booking_room', { bookingId });
            sock.off('driver:location_update', handleUpdate);
        };
    }, [bookingId, mapData]);

    // Initialize and update the Leaflet map
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current || !mapData) return;

        const L = window.L;

        // Create map if it doesn't exist
        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([11.6, 92.7], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 18
            }).addTo(mapInstanceRef.current);
        }

        const map = mapInstanceRef.current;

        // CLEAR EXISTING MARKERS to avoid duplicates on re-render
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        const bounds = [];

        // Pickup pin (green)
        if (mapData.pickup?.latitude && mapData.pickup?.longitude) {
            const pickupIcon = L.divIcon({
                className: 'custom-marker pickup-marker',
                html: '<div class="marker-dot pickup"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            L.marker([mapData.pickup.latitude, mapData.pickup.longitude], { icon: pickupIcon })
                .addTo(map)
                .bindPopup(`<b>Pickup:</b> ${mapData.pickup.name || 'Clinic'}`);
            bounds.push([mapData.pickup.latitude, mapData.pickup.longitude]);
        }

        // Dropoff pin (red)
        if (mapData.dropoff?.latitude && mapData.dropoff?.longitude) {
            const dropoffIcon = L.divIcon({
                className: 'custom-marker dropoff-marker',
                html: '<div class="marker-dot dropoff"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            L.marker([mapData.dropoff.latitude, mapData.dropoff.longitude], { icon: dropoffIcon })
                .addTo(map)
                .bindPopup(`<b>Dropoff:</b> ${mapData.dropoff.name || 'Hospital'}`);
            bounds.push([mapData.dropoff.latitude, mapData.dropoff.longitude]);
        }

        // Re-add driver marker if position exists
        if (driverPos) {
            const driverIcon = L.divIcon({
                className: 'custom-marker driver-marker',
                html: '<div class="marker-dot driver"><div class="driver-pulse"></div></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            driverMarkerRef.current = L.marker([driverPos.lat, driverPos.lng], { icon: driverIcon })
                .addTo(map)
                .bindPopup('🚗 Driver');
        }

        // Fit bounds
        if (bounds.length >= 2) {
            map.fitBounds(bounds, { padding: [40, 40] });
        } else if (bounds.length === 1) {
            map.setView(bounds[0], 13);
        }

    }, [leafletLoaded, mapData, driverPos]); // Added driverPos dependency to redraw marker on map init


    // Driver marker update logic merged into main effect to prevent synchronization issues


    if (loading) {
        return (
            <div className="live-map-container loading">
                <div className="spinner-small"></div>
                <span>Loading map...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="live-map-container error">
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="live-map-container">
            <div className="live-map-header">
                <div className="live-map-title">
                    <Navigation size={16} className="map-icon" />
                    <span>Live Driver Tracking</span>
                    {eta && (
                        <span className={`eta-badge ${getETAClass(eta.minutesRemaining)}`}>
                            <Clock size={12} />
                            {eta.minutesRemaining} min ({eta.distanceKm} km)
                        </span>
                    )}
                </div>
                {onClose && (
                    <button className="map-close-btn" onClick={onClose}>×</button>
                )}
            </div>
            <div ref={mapRef} className="live-map-canvas" />
            {!driverPos && (
                <div className="map-waiting">
                    <p>Waiting for driver GPS signal...</p>
                </div>
            )}
        </div>
    );
}

function getETAClass(minutes) {
    if (minutes < 10) return 'eta-red';
    if (minutes < 20) return 'eta-amber';
    return 'eta-green';
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
