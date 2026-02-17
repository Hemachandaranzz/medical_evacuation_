import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { X, Truck, User, Phone, Mail, MapPin, Building2, Shield, Calendar, CreditCard } from 'lucide-react';
import './TransportProviderModal.css';

const TransportProviderModal = ({ isOpen, onClose, provider }) => {
    const [activeTab, setActiveTab] = useState('vehicles');
    const [vehicles, setVehicles] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && provider) {
            fetchDetails();
        }
    }, [isOpen, provider]);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            // Fetch Vehicles
            const { data: vehiclesData, error: vehiclesError } = await supabase
                .from('vehicles')
                .select('*')
                .eq('company_id', provider.id);

            if (vehiclesError) throw vehiclesError;
            setVehicles(vehiclesData || []);

            // Fetch Drivers
            const { data: driversData, error: driversError } = await supabase
                .from('drivers')
                .select('*')
                .eq('company_id', provider.id);

            if (driversError) throw driversError;
            setDrivers(driversData || []);

        } catch (error) {
            console.error('Error fetching provider details:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleDriverUpdate = (data) => {
            setDrivers(prev => prev.map(driver =>
                driver.id === data.driverId
                    ? { ...driver, current_status: data.status, is_online: data.status === 'available' }
                    : driver
            ));
        };

        const socketInstance = import('../../services/socketClient').then(({ socket }) => {
            socket.on('driver:updated', handleDriverUpdate);
        });

        return () => {
            import('../../services/socketClient').then(({ socket }) => {
                socket.off('driver:updated', handleDriverUpdate);
            });
        };
    }, [isOpen]);

    if (!isOpen || !provider) return null;

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString();
    };

    return (
        <div className="provider-modal-overlay" onClick={onClose}>
            <div className="provider-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div className="modal-title-section">
                        <div className="company-avatar">
                            {provider.company_name.charAt(0)}
                        </div>
                        <div className="company-info">
                            <h2>
                                {provider.company_name}
                                {provider.is_verified ? (
                                    <span className="status-chip success" style={{ marginLeft: '12px', fontSize: '0.8rem' }}>Verified</span>
                                ) : (
                                    <span className="status-chip warning" style={{ marginLeft: '12px', fontSize: '0.8rem' }}>Pending</span>
                                )}
                            </h2>
                            <div className="detail-value" style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                                <MapPin size={14} /> {provider.operating_location} • Joined {formatDate(provider.created_at)}
                            </div>
                        </div>
                    </div>
                    <button
                        className="modal-close-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Details Grid */}
                <div className="details-grid">
                    <div className="detail-item">
                        <span className="detail-label">Contact Email</span>
                        <span className="detail-value"><Mail size={16} /> {provider.contact_email}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Contact Phone</span>
                        <span className="detail-value"><Phone size={16} /> {provider.contact_phone}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Business Reg. No.</span>
                        <span className="detail-value"><Building2 size={16} /> {provider.business_registration_number || 'N/A'}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Operating License</span>
                        <span className="detail-value"><Shield size={16} /> {provider.operating_license || 'N/A'}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Service Radius</span>
                        <span className="detail-value"><MapPin size={16} /> {provider.service_coverage_radius_km} km</span>
                    </div>
                </div>

                {/* Content Area */}
                <div className="modal-tabs">
                    <button
                        className={`modal-tab ${activeTab === 'vehicles' ? 'active' : ''}`}
                        onClick={() => setActiveTab('vehicles')}
                    >
                        <Truck size={18} />
                        Vehicles
                        <span className="tab-badge">{vehicles.length}</span>
                    </button>
                    <button
                        className={`modal-tab ${activeTab === 'drivers' ? 'active' : ''}`}
                        onClick={() => setActiveTab('drivers')}
                    >
                        <User size={18} />
                        Drivers
                        <span className="tab-badge">{drivers.length}</span>
                    </button>
                </div>

                <div className="tab-content">
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'vehicles' && (
                                <div className="vehicles-list">
                                    {vehicles.length === 0 ? (
                                        <div className="empty-state">No vehicles added yet</div>
                                    ) : (
                                        vehicles.map(vehicle => (
                                            <div key={vehicle.id} className="list-card">
                                                <div className="vehicle-header">
                                                    <div className="type-icon">
                                                        <Truck size={20} />
                                                    </div>
                                                    <div>
                                                        <span className="item-title">{vehicle.vehicle_name} ({vehicle.registration_number})</span>
                                                        <span className="item-subtitle">{vehicle.vehicle_type} • {vehicle.manufacturer} {vehicle.model}</span>
                                                    </div>
                                                </div>
                                                <div className="vehicle-meta">
                                                    <span className={`status-chip ${vehicle.is_active ? 'success' : 'neutral'}`}>
                                                        {vehicle.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'drivers' && (
                                <div className="drivers-list">
                                    {drivers.length === 0 ? (
                                        <div className="empty-state">No drivers registered yet</div>
                                    ) : (
                                        drivers.map(driver => (
                                            <div key={driver.id} className="list-card">
                                                <div className="driver-header">
                                                    <div className="type-icon">
                                                        <User size={20} />
                                                    </div>
                                                    <div>
                                                        <span className="item-title">{driver.full_name}</span>
                                                        <span className="item-subtitle">License: {driver.license_number}</span>
                                                    </div>
                                                </div>
                                                <div className="driver-meta">
                                                    <span className={`status-chip ${driver.is_online ? 'success' : 'neutral'}`}>
                                                        {driver.is_online ? 'Online' : 'Offline'}
                                                    </span>
                                                    <span className={`status-chip ${driver.approval_status === 'approved' ? 'success' : 'warning'}`} style={{ marginLeft: '8px' }}>
                                                        {driver.approval_status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TransportProviderModal;
