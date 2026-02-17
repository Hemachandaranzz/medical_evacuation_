import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialized, setInitialized] = useState(false);

    // Helpers
    const fetchProfile = async (userId) => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        return data;
    };

    const fetchHospital = async (userId) => {
        const { data, error } = await supabase.from('hospitals').select('*').eq('admin_id', userId).maybeSingle();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
        return data;
    };

    const createProfile = async (userData) => {
        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: userData.id,
                email: userData.email,
                full_name: userData.user_metadata?.full_name || '',
                role: 'hospital_admin',
            }, { onConflict: 'id' })
            .select()
            .single();

        if (error) throw error;
        return data;
    };

    useEffect(() => {
        let active = true;

        const initAuth = async () => {
            try {
                // 1. Get Session ONCE
                const { data } = await supabase.auth.getSession();
                const session = data.session;

                if (!active) return;

                if (!session) {
                    setLoading(false);
                    setInitialized(true);
                    return;
                }

                setUser(session.user);

                // 2. Fetch or Create Profile
                let profileData = await fetchProfile(session.user.id);
                if (!profileData) {
                    profileData = await createProfile(session.user);
                }

                // 3. Fetch Hospital (if exists)
                const hospitalData = await fetchHospital(session.user.id);

                if (active) {
                    setProfile(profileData);
                    setHospital(hospitalData);
                }
            } catch (err) {
                console.error('Auth init error:', err);
                toast.error('Authentication error. Please try again.');
            } finally {
                if (active) {
                    setLoading(false);
                    setInitialized(true);
                }
            }
        };

        initAuth();

        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === 'SIGNED_OUT') {
                    if (active) {
                        setUser(null);
                        setProfile(null);
                        setHospital(null);
                    }
                } else if (event === 'SIGNED_IN' && session) {
                    // Re-run init if user changed or we were null
                    if (active && (!user || user.id !== session.user.id)) {
                        setLoading(true);
                        initAuth();
                    }
                }
            }
        );

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const refreshHospital = useCallback(async () => {
        if (!user) return null;
        const data = await fetchHospital(user.id);
        setHospital(data || null);
        return data;
    }, [user]);

    const signInWithGoogle = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin },
            });
            if (error) throw error;
        } catch (error) {
            toast.error('Login failed: ' + error.message);
        }
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setHospital(null);
        toast.success('Logged out successfully');
    }, []);

    const registerHospital = useCallback(async (hospitalData) => {
        if (!user) {
            toast.error('You must be logged in');
            return { success: false };
        }

        try {
            const { data, error } = await supabase
                .from('hospitals')
                .upsert([{
                    ...hospitalData,
                    operating_location: hospitalData.region, // Auto-populate from region
                    total_beds: parseInt(hospitalData.total_beds, 10) || 0,
                    specialities: hospitalData.specialities || [],
                    admin_id: user.id,
                    admin_email: user.email,
                    status: 'pending_approval', // Reset to pending on resubmission
                    updated_at: new Date().toISOString()
                }], { onConflict: 'admin_id' })
                .select()
                .single();

            if (error) throw error;

            setHospital(data);
            toast.success('Hospital registered and active!');
            return { success: true, data };
        } catch (error) {
            toast.error('Registration failed: ' + error.message);
            return { success: false, error };
        }
    }, [user]);

    const value = useMemo(() => ({
        user,
        profile,
        hospital,
        loading,
        initialized,
        signInWithGoogle,
        signOut,
        registerHospital,
        refreshHospital,
        isHospitalApproved: hospital?.status === 'active',
        isHospitalPending: hospital?.status === 'pending_approval',
        hasHospital: !!hospital,
    }), [user, profile, hospital, loading, initialized, signInWithGoogle, signOut, registerHospital, refreshHospital]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
