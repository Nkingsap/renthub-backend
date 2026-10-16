import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client for Cloudflare Worker
 * @param {Object} env - Cloudflare Worker environment (secrets)
 */
export function getSupabaseClient(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    }
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });
}
