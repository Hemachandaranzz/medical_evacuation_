import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/apiClient';
import {
    Users,
    Activity,
    Stethoscope,
    Ambulance,
    Plus,
    ArrowRight,
    Heart,
    Thermometer,
    Wind,
    FileText,
} from 'lucide-react';
import './Dashboard.css';
import LocationCapture from '../../components/LocationCapture/LocationCapture';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalPatients: 0,
        todayVitals: 0,
        evacuations: 0,
    });
    const [recentPatients, setRecentPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const response = await api.get('/dashboard/stats');

            if (response.stats) {
                setStats(response.stats);
            }
            if (response.recentPatients) {
                setRecentPatients(response.recentPatients);
            }
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="dashboard-premium">
            {/* Location Capture — invisible if clinic coordinates already saved */}
            <LocationCapture
                endpoint="/location/clinic"
                checkEndpoint="/clinics/me"
            />

            {/* Header */}
            <div className="dashboard-header-premium">
                <div>
                    <h1 className="dashboard-title-gradient">Doctor Dashboard</h1>
                    <p className="dashboard-subtitle">Monitor patients and manage care</p>
                </div>
                <Link to="/patients/new" className="btn btn-primary">
                    <Plus size={18} />
                    New Patient
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid-premium">
                <div className="stat-card-premium primary">
                    <div className="stat-icon-box">
                        <Users size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value-large">{stats.totalPatients}</span>
                        <span className="stat-label">Total Patients</span>
                    </div>
                </div>

                <div className="stat-card-premium secondary">
                    <div className="stat-icon-box">
                        <Activity size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value-large">{stats.todayVitals}</span>
                        <span className="stat-label">Vitals Today</span>
                    </div>
                </div>

                <div className="stat-card-premium tertiary">
                    <div className="stat-icon-box">
                        <Ambulance size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value-large">{stats.evacuations}</span>
                        <span className="stat-label">Active Evacuations</span>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="dashboard-grid-premium">
                {/* Recent Patients */}
                <div className="dashboard-panel-premium">
                    <div className="panel-header-row">
                        <h3 className="panel-title">
                            <Users size={20} />
                            Recent Patients
                        </h3>
                        <Link to="/patients" className="panel-link">
                            View All <ArrowRight size={16} />
                        </Link>
                    </div>
                    <div className="patient-list-premium">
                        {loading ? (
                            <div className="panel-loading"><div className="spinner"></div></div>
                        ) : recentPatients.length === 0 ? (
                            <div className="panel-empty">
                                <Users size={40} />
                                <p>No patients yet</p>
                            </div>
                        ) : (
                            recentPatients.map((patient) => (
                                <div
                                    key={patient.id}
                                    className="patient-item-premium"
                                    onClick={() => navigate(`/records/${patient.id}`)}
                                >
                                    <div className="patient-avatar-circle">
                                        {patient.name?.charAt(0) || 'P'}
                                    </div>
                                    <div className="patient-info-col">
                                        <span className="patient-name">{patient.name}</span>
                                        <span className="patient-meta">
                                            {patient.age} yrs • {patient.gender}
                                        </span>
                                    </div>
                                    <button className="view-btn-small">
                                        <FileText size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="dashboard-panel-premium">
                    <div className="panel-header-row">
                        <h3 className="panel-title">
                            <Stethoscope size={20} />
                            Quick Actions
                        </h3>
                    </div>
                    <div className="quick-actions-grid">
                        <Link to="/vitals" className="quick-action-card">
                            <Activity size={28} className="action-icon vitals" />
                            <span className="action-label">Log Vitals</span>
                        </Link>
                        <Link to="/patients/new" className="quick-action-card">
                            <Plus size={28} className="action-icon add" />
                            <span className="action-label">New Patient</span>
                        </Link>
                        <Link to="/records" className="quick-action-card">
                            <FileText size={28} className="action-icon records" />
                            <span className="action-label">Records</span>
                        </Link>
                        <Link to="/evacuations" className="quick-action-card">
                            <Ambulance size={28} className="action-icon evac" />
                            <span className="action-label">Evacuations</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
