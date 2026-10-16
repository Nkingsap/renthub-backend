import { json, err } from '../lib/response.js';
import { getPlan } from '../lib/plans.js';

/**
 * Auth routes
 * POST /api/auth/register
 * POST /api/auth/login
 */
export async function handleAuth(request, supabase, path) {
    const method = request.method;

    // POST /api/auth/register
    if (method === 'POST' && path === '/api/auth/register') {
        const { email, password, name, role, phone } = await request.json();
        if (!email || !password || !name) {
            return err('email, password, and name are required');
        }

        // Check if already exists — .single() returns error code PGRST116 when no row found
        const { data: existing, error: existErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle(); // maybeSingle() returns null (not error) when no row found

        if (existing) return err('Email already registered', 409);

        // Normalize role: frontend sends 'user', DB uses 'tenant'
        const normalizedRole = role === 'owner' ? 'owner' : 'tenant';

        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: email.toLowerCase(),
                password, // NOTE: store hashed passwords in production — use Supabase Auth for real apps
                name,
                phone: phone || null,
                role: normalizedRole,
            })
            .select()
            .single();

        if (error) return err(error.message, 500);
        const { password: _, ...safeUser } = user;

        // Owners are welcomed with the free Starter Pack — it is auto-applied to
        // their first listing (30 days of visibility).
        const starter = normalizedRole === 'owner' ? getPlan('starter') : null;
        return json({ user: safeUser, starter }, 201);
    }

    // POST /api/auth/login
    if (method === 'POST' && path === '/api/auth/login') {
        const { email, password } = await request.json();
        if (!email || !password) return err('email and password are required');

        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('password', password)
            .maybeSingle(); // returns null instead of error when no match

        if (!user) return err('Invalid email or password', 401);
        const { password: _, ...safeUser } = user;
        return json({ user: safeUser });
    }

    return null; // route not matched
}
