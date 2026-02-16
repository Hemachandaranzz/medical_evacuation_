import { supabase } from '../config/supabase.js';

/**
 * Auth Middleware - Verifies Supabase JWT token
 * Extracts user from Authorization header and attaches to req.user
 */
export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        // Verify the JWT with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Fetch clinic_id for this user
        // In this system, one user (admin) manages one clinic
        const { data: clinic } = await supabase
            .from('clinics')
            .select('id, status')
            .eq('admin_id', user.id)
            .maybeSingle();

        // Attach user and clinic info to request
        req.user = user;
        req.clinicId = clinic?.id || null;
        req.clinicStatus = clinic?.status || null;

        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(500).json({ error: 'Authentication failed', details: err.message });
    }
};

/**
 * Clinic Auth Middleware - Ensures user has an active, approved clinic
 */
export const clinicAuth = async (req, res, next) => {
    await authMiddleware(req, res, () => {
        if (!req.clinicId) {
            return res.status(403).json({ error: 'No clinic associated with this account' });
        }
        if (req.clinicStatus !== 'active') {
            return res.status(403).json({ error: 'Clinic setup is pending approval' });
        }
        next();
    });
};

