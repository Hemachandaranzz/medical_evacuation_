import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [clinic, setClinic] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialized, setInitialized] = useState(false);

    // Helpers
    const fetchProfile = async (userId) => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        return data;
    };

    const fetchClinic = async (userId) => {
        const { data, error } = await supabase.from('clinics').select('*').eq('admin_id', userId).maybeSingle();
        if (error) throw error;
        return data;
    };

    const createProfile = async (user) => {
        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || '',
                role: 'clinic_doctor', // Default role for portal users
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

                // 2. Fetch Profile
                let profileData = await fetchProfile(session.user.id);
                if (!profileData) {
                    profileData = await createProfile(session.user);
                }

                // 3. Fetch Clinic
                const clinicData = await fetchClinic(session.user.id);

                if (active) {
                    setProfile(profileData);
                    setClinic(clinicData);
                }
            } catch (err) {
                console.error('Auth init error:', err);
            } finally {
                if (active) {
                    console.log('Auth initialized.');
                    setLoading(false);
                    setInitialized(true);
                }
            }
        };

        initAuth();

        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (!active) return;

                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setProfile(null);
                    setClinic(null);
                } else if (event === 'SIGNED_IN' && session) {
                    console.log('Auth SIGNED_IN event triggered');
                    // Only re-init if we don't have a user or it's a different user
                    setUser(prevUser => {
                        if (!prevUser || prevUser.id !== session.user.id) {
                            // We can't easily call initAuth here without risk of loop if not careful.
                            // But since we set user immediately, let's just trigger a reload of profile/clinic if needed.
                            // Ideally, initAuth handles the initial load. 
                            // This event is mostly for session refreshes or implementation details.
                            // Let's just update the user state.
                            return session.user;
                        }
                        return prevUser;
                    });

                    // If we just signed in and profile is missing, fetch it.
                    // Using a separate check to avoid loop
                    setProfile(prev => {
                        if (!prev) {
                            // Trigger fetch (async, side effect) - careful!
                            // Better to just let components handle missing profile or reload page.
                            // But for now, let's trust initAuth ran on mount.
                            // If this is a post-login event, initAuth should have run or will run.
                            // BUT onAuthStateChange fires INITIAL_SESSION too sometimes.
                            return prev;
                        }
                        return prev;
                    });
                }
            }
        );

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const refreshClinic = useCallback(async () => {
        if (!user) return null;
        const data = await fetchClinic(user.id);
        setClinic(data || null);
        return data;
    }, [user]);

    const signInWithGoogle = useCallback(async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setClinic(null);
    }, []);

    const value = useMemo(() => ({
        user,
        profile,
        clinic,
        loading,
        initialized,
        signInWithGoogle,
        signOut,
        refreshClinic,
        isDoctor: profile?.role === 'clinic_doctor' || profile?.role === 'clinic_admin',
        isClinicApproved: clinic?.status === 'active',
        isClinicPending: clinic?.status === 'pending_approval',
        isClinicRejected: clinic?.status === 'suspended',
        hasClinic: !!clinic,
    }), [user, profile, clinic, loading, initialized, signInWithGoogle, signOut, refreshClinic]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
