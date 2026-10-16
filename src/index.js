import { getSupabaseClient } from './lib/supabase.js';
import { corsPreflightResponse, err, json } from './lib/response.js';
import { handleAuth } from './routes/auth.js';
import { handleListings } from './routes/listings.js';
import { handleFavorites } from './routes/favorites.js';
import { handleMaps } from './routes/maps.js';
import { handleUploads } from './routes/uploads.js';
import { handlePlans } from './routes/plans.js';
import { handlePayments } from './routes/payments.js';

export default {
    async fetch(request, env) {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return corsPreflightResponse();
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            const supabase = getSupabaseClient(env);

            // ── Auth ──────────────────────────────────────────────────────────
            if (path.startsWith('/api/auth/')) {
                const res = await handleAuth(request, supabase, path);
                if (res) return res;
            }

            // ── Listings ──────────────────────────────────────────────────────
            if (path.startsWith('/api/listings')) {
                const res = await handleListings(request, supabase, path, url);
                if (res) return res;
            }

            // ── Favorites ─────────────────────────────────────────────────────
            if (path.startsWith('/api/favorites/')) {
                const res = await handleFavorites(request, supabase, path);
                if (res) return res;
            }

            // ── Packs (business model) ────────────────────────────────────────
            if (path === '/api/plans' || path.startsWith('/api/packs/')) {
                const res = await handlePlans(request, supabase, path, url);
                if (res) return res;
            }

            // ── Payments (demo gateway) ───────────────────────────────────────
            if (path.startsWith('/api/payments/')) {
                const res = await handlePayments(request, supabase, path);
                if (res) return res;
            }

            // ── Uploads ───────────────────────────────────────────────────────
            if (path.startsWith('/api/upload/')) {
                const res = await handleUploads(request, supabase, env, path);
                if (res) return res;
            }

            // ── Maps / Geocoding ──────────────────────────────────────────────
            if (path.startsWith('/api/maps/')) {
                const res = await handleMaps(request, env, path, url);
                if (res) return res;
            }

            // ── Health check ──────────────────────────────────────────────────
            if (path === '/api/health') {
                return json({ status: 'ok', timestamp: new Date().toISOString() });
            }

            return err('Route not found', 404);

        } catch (e) {
            console.error(e);
            return err('Internal server error: ' + e.message, 500);
        }
    },
};
