import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProfile = async (userId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    };

    const createProfile = async (user) => {
        const { data, error } = await supabase
            .from('profiles')
            .insert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
                role: 'admin', // ⚠️ Admin Portal specific
            })
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
                    return;
                }

                setUser(session.user);

                const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
                if (session.user.email !== adminEmail) {
                    console.warn(`Unauthorized admin access attempt by ${session.user.email}. Logging out.`);
                    await supabase.auth.signOut();
                    if (active) {
                        setError('Access denied. Only the master admin can access this portal.');
                        setUser(null);
                        setProfile(null);
                        setLoading(false);
                    }
                    return;
                }

                // 2. Fetch Profile ONCE
                let profile = await fetchProfile(session.user.id);
                if (!profile) {
                    profile = await createProfile(session.user);
                }

                // 3. Status Check & Auto-Fix for Master Admin
                if (profile.role !== 'admin') {
                    console.warn(`Role mismatch for master admin. Updating role from ${profile.role} to admin.`);

                    const { data: updatedProfile, error: updateError } = await supabase
                        .from('profiles')
                        .update({ role: 'admin' })
                        .eq('id', session.user.id)
                        .select()
                        .single();

                    if (!updateError && updatedProfile) {
                        profile = updatedProfile;
                    } else {
                        console.error('Failed to auto-fix admin role:', updateError);
                        // Fallback to logout if update fails
                        await supabase.auth.signOut();
                        if (active) {
                            setError('Role mismatch. Failed to promote to admin.');
                            setUser(null);
                            setProfile(null);
                            setLoading(false);
                        }
                        return;
                    }
                }

                if (active) {
                    setProfile(profile);
                }
            } catch (err) {
                console.error('Auth init error:', err);
                if (active) setError(err.message);
            } finally {
                if (active) setLoading(false);
            }
        };

        initAuth();

        // 4. Listener ONLY handles Sign Out (or passive updates)
        // Does NOT fetch profiles to avoid race conditions.
        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === 'SIGNED_OUT') {
                    if (active) {
                        setUser(null);
                        setProfile(null);
                    }
                } else if (event === 'SIGNED_IN' && session) {
                    // Slight redundancy safety: if we somehow signed in via a different tab
                    // and this tab catches it, strictly we might want to re-validate.
                    // But for the "clean" model, we rely on the initial load or a forced reload.
                    // If we want to support switching accounts without reload, we could call initAuth() here.
                    // For stability, let's keep it simple as requested.
                    if (active && (!user || user.id !== session.user.id)) {
                        // Detect user change, trigger re-init
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

    const signInWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    const value = {
        user,
        profile,
        loading,
        error,
        isAdmin: profile?.role === 'admin',
        signInWithGoogle,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
