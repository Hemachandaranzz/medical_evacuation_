import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Building2,
    Hospital,
    Truck,
    Activity,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Shield,
    Wifi,
    WifiOff,
    MapPinned,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './AppLayout.css';

const navigation = [
    {
        section: 'Overview',
        items: [
            { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        ],
    },
    {
        section: 'Entity Management',
        items: [
            { name: 'Clinics', path: '/clinics', icon: Building2 },
            { name: 'Hospitals', path: '/hospitals', icon: Hospital },
            { name: 'Transport', path: '/transport', icon: Truck },
        ],
    },
    {
        section: 'System',
        items: [
            { name: 'Activity Log', path: '/activity', icon: Activity },
            { name: 'Settings', path: '/settings', icon: Settings },
        ],
    },
];

const AppLayout = () => {
    const { user, profile, signOut } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const location = useLocation();

    // Track online/offline status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Get current page name for breadcrumb
    const getCurrentPageName = () => {
        const path = location.pathname;
        for (const section of navigation) {
            for (const item of section.items) {
                if (item.path === path) return item.name;
            }
        }
        return 'Dashboard';
    };

    // Get user initials for avatar
    const getInitials = () => {
        const name = profile?.full_name || user?.email || 'Admin';
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (err) {
            console.error('Sign out error:', err);
        }
    };

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
                {/* Sidebar Header */}
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <Shield />
                    </div>
                    <div className="sidebar-brand">
                        <span className="sidebar-title">MedEvac</span>
                        <span className="sidebar-subtitle">Admin Portal</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    {navigation.map((section) => (
                        <div key={section.section} className="nav-section">
                            <span className="nav-section-title">{section.section}</span>
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `nav-item ${isActive ? 'active' : ''}`
                                    }
                                    title={collapsed ? item.name : undefined}
                                >
                                    <item.icon />
                                    <span className="nav-item-text">{item.name}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                {/* Sidebar Footer - User Profile */}
                <div className="sidebar-footer">
                    <div className="user-profile">
                        <div className="user-avatar">
                            {user?.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="Avatar" />
                            ) : (
                                getInitials()
                            )}
                        </div>
                        <div className="user-info">
                            <div className="user-name">
                                {profile?.full_name || user?.email?.split('@')[0]}
                            </div>
                            <div className="user-role">
                                {profile?.role || 'Administrator'}
                            </div>
                        </div>
                    </div>
                    <button className="btn btn-ghost logout-btn" onClick={handleSignOut}>
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className="main-wrapper">
                {/* Topbar */}
                <header className="topbar">
                    <div className="topbar-left">
                        <button
                            className="collapse-btn"
                            onClick={() => setCollapsed(!collapsed)}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                        <div className="breadcrumb">
                            <span className="breadcrumb-item">Admin</span>
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-item current">{getCurrentPageName()}</span>
                        </div>
                    </div>
                    <div className="topbar-right">
                        <div className={`connection-status ${isOnline ? '' : 'offline'}`}>
                            <span className="status-dot"></span>
                            {isOnline ? (
                                <>
                                    <Wifi size={14} />
                                    <span>Connected</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff size={14} />
                                    <span>Offline</span>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
