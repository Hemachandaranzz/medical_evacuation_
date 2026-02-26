import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Clinics from './pages/Clinics/Clinics';
import Transport from './pages/Transport/Transport';
import Hospitals from './pages/Hospitals/Hospitals';
import './styles/global.css';

// Placeholder pages for future implementation
const ActivityLog = () => (
  <div className="page-container">
    <h1 className="page-title">Activity Log</h1>
    <p className="page-description">System activity and audit trail will be displayed here.</p>
  </div>
);

const Settings = () => (
  <div className="page-container">
    <h1 className="page-title">Settings</h1>
    <p className="page-description">System configuration and preferences.</p>
  </div>
);

import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{
        className: 'premium-toast',
        style: {
          background: '#0f172a',
          color: '#fff',
          border: '1px solid #1e293b'
        }
      }} />
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clinics" element={<Clinics />} />
            <Route path="transport" element={<Transport />} />
            <Route path="hospitals" element={<Hospitals />} />
            <Route path="activity" element={<ActivityLog />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
