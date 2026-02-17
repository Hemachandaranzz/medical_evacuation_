import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * API client with 3-second hard timeout
 */
export const api = {
    request: async (endpoint, options = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            console.log('API Debug - Requesting:', endpoint);
            console.log('API Debug - Session User:', session?.user?.id);
            console.log('API Debug - Token (first 10):', token ? token.slice(0, 10) : 'NONE');
            console.log('API Debug - Expires At:', session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A');


            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { Authorization: `Bearer ${token}` }),
                    ...options.headers,
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || `HTTP Error ${response.status}`;
                console.warn(`API ${endpoint}: ${errorMessage}`);
                throw new Error(errorMessage);
            }

            const json = await response.json();
            return json;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw error;
        }
    },

    get: (endpoint) => api.request(endpoint, { method: 'GET' }),

    post: (endpoint, body) => api.request(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
    }),

    patch: (endpoint, body) => api.request(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body),
    }),

    delete: (endpoint) => api.request(endpoint, { method: 'DELETE' }),
};
