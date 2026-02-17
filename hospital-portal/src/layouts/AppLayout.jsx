import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MapPin } from 'lucide-react';
import './AppLayout.css';

export default function AppLayout() {
    const { hospital, user, signOut } = useAuth();
    const location = useLocation();
    useEffect(() => {
        console.log('🚀 Current API_URL:', import.meta.env.VITE_API_URL || 'FALLBACK: http://localhost:3000');
    }, []);

    const navItems = [
        { path: '/', label: 'Dashboard', icon: '📊' },
        { path: '/beds', label: 'Bed Management', icon: '🛏️' },
        { path: '/cases', label: 'Critical Cases', icon: '🚨', danger: true },
    ];

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Dashboard';
        if (path === '/beds') return 'Bed Management';
        if (path === '/cases') return 'Critical Cases';
        if (path.includes('/case/')) return 'Patient Details';
        return 'Hospital Portal';
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">🏥</div>
                    <div className="sidebar-brand">
                        <span className="sidebar-title" style={{ fontSize: '0.9rem', lineHeight: '1.2' }}>
                            {hospital?.name || 'Hospital'}
                        </span>
                        <span className="sidebar-subtitle">Hospital Portal</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section">
                        <span className="nav-section-title">Main</span>
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.path === '/'}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-item-text">{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="user-profile">
                        <div className="user-avatar">
                            {hospital?.name?.charAt(0) || 'H'}
                        </div>
                        <div className="user-info">
                            <span className="user-name">{hospital?.name}</span>
                            <span className="user-role">{hospital?.operating_location} • {hospital?.city}</span>
                        </div>
                    </div>
                    <button className="btn btn-ghost logout-btn" onClick={signOut}>
                        <span>🚪</span>
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            <div className="main-wrapper">
                <header className="topbar">
                    <div className="topbar-left">
                        <div className="breadcrumb">
                            <span className="breadcrumb-item">Hospital Portal</span>
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-item current">{getPageTitle()}</span>
                        </div>
                    </div>

                    <div className="topbar-right">
                        {hospital?.operating_location && (
                            <div className="location-badge">
                                <MapPin size={14} />
                                <span>{hospital.operating_location}</span>
                            </div>
                        )}
                        <div className="user-email-display">{user?.email}</div>
                    </div>
                </header>

                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
