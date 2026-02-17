import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

// Components (we'll create these)
import LoginPage from './components/auth/LoginPage'
import OnboardingWizard from './components/auth/OnboardingWizard'
import PendingApproval from './components/auth/PendingApproval'
import Dashboard from './components/dashboard/Dashboard'
import VehicleManagement from './components/vehicles/VehicleManagement'
import DriverManagement from './components/drivers/DriverManagement'
import RequestMonitor from './components/requests/RequestMonitor'
import Analytics from './components/analytics/Analytics'
import BookingRequests from './components/bookings/BookingRequests'
import DriverAssignment from './components/bookings/DriverAssignment'
import DevPanel from './components/shared/DevPanel'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [needsOnboarding, setNeedsOnboarding] = useState(false)
    const [isVerified, setIsVerified] = useState(true)
    const [isRejected, setIsRejected] = useState(false)
    const [companyName, setCompanyName] = useState('')

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session) {
                checkOnboardingStatus(session.user.id)
            } else {
                setLoading(false)
            }
        })

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session) {
                checkOnboardingStatus(session.user.id)
            } else {
                setLoading(false)
                setNeedsOnboarding(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const checkOnboardingStatus = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('transport_companies')
                .select('id, is_verified, is_active, company_name')
                .eq('user_id', userId)
                .maybeSingle()

            if (error || !data) {
                setNeedsOnboarding(true)
                setIsVerified(true) // Allow to complete onboarding
                setIsRejected(false)
            } else {
                setNeedsOnboarding(false)
                setCompanyName(data.company_name)
                // Check if verified and active
                setIsVerified(data.is_verified && data.is_active)
                setIsRejected(data.is_active === false)
            }
        } catch (err) {
            console.error('Error checking onboarding:', err)
            setNeedsOnboarding(true)
            setIsVerified(true)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                <div className="spinner"></div>
            </div>
        )
    }

    return (
        <Router>
            <Routes>
                {!session ? (
                    <>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </>
                ) : (needsOnboarding || isRejected) ? (
                    <>
                        <Route path="/onboarding" element={<OnboardingWizard onComplete={() => {
                            setNeedsOnboarding(false)
                            setIsRejected(false)
                            checkOnboardingStatus(session.user.id)
                        }} />} />
                        <Route path="*" element={<Navigate to="/onboarding" replace />} />
                    </>
                ) : !isVerified ? (
                    <>
                        <Route path="/pending" element={<PendingApproval companyName={companyName} isRejected={isRejected} />} />
                        <Route path="*" element={<Navigate to="/pending" replace />} />
                    </>
                ) : (
                    <>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/vehicles" element={<VehicleManagement />} />
                        <Route path="/drivers" element={<DriverManagement />} />
                        <Route path="/requests" element={<RequestMonitor />} />
                        <Route path="/bookings" element={<BookingRequests />} />
                        <Route path="/bookings/:bookingId/assign-driver" element={<DriverAssignment />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                )}
            </Routes>
            <DevPanel />
        </Router>
    )
}

export default App
