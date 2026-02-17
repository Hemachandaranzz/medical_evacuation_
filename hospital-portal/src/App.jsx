import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Pending from './pages/Pending/Pending';
import Dashboard from './pages/Dashboard/Dashboard';
import CriticalCases from './pages/CriticalCases/CriticalCases';
import PatientDetail from './pages/PatientDetail/PatientDetail';
import BedManagement from './pages/BedManagement/BedManagement';
import PatientCase from './pages/PatientCase/PatientCase';
import './index.css';

// Loading screen component
const LoadingScreen = () => (
  <div className="loading-screen">
    <div className="loading-spinner"></div>
    <p>Loading Hospital Portal...</p>
  </div>
);

// Protected Route wrapper with fast checking
const ProtectedRoute = ({ children }) => {
  const { user, hospital, loading, initialized } = useAuth();

  // Show loading only until initialized
  if (!initialized || loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user exists but no hospital registered, go to registration
  if (!hospital) {
    return <Navigate to="/register" replace />;
  }

  // If hospital exists but pending approval, show pending screen
  if (hospital.status === 'pending_approval' || hospital.status === 'suspended') {
    return <Navigate to="/pending" replace />;
  }

  return children;
};

function AppRoutes() {
  const { user, hospital, loading, initialized } = useAuth();

  // Fast loading check
  if (!initialized) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={
        user ? <Navigate to="/" replace /> : <Login />
      } />

      {/* Registration */}
      <Route path="/register" element={
        !user ? <Navigate to="/login" replace /> :
          (hospital && hospital.status !== 'suspended') ? <Navigate to="/" replace /> :
            <Register />
      } />

      {/* Pending Approval */}
      <Route path="/pending" element={
        !user ? <Navigate to="/login" replace /> :
          !hospital ? <Navigate to="/register" replace /> :
            hospital.status === 'active' ? <Navigate to="/" replace /> :
              <Pending />
      } />

      {/* Protected Routes with Sidebar Layout */}
      <Route path="/" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="cases" element={<CriticalCases />} />
        <Route path="beds" element={<BedManagement />} />
        <Route path="patient/:patientId" element={<PatientDetail />} />
        <Route path="patient/:patientId" element={<PatientDetail />} />
        <Route path="case/:caseId" element={<PatientCase />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
            },
            success: {
              iconTheme: { primary: '#4fd1c5', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
