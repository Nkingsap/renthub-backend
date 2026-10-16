import { json, err } from '../lib/response.js';
import { planList, getPlan, withVisibility, daysLeft } from '../lib/plans.js';

/**
 * Pack routes
 * GET /api/plans            - Pack catalog (add ?userId= to include starter availability)
 * GET /api/packs/:userId    - An owner's pack status: starter, listings visibility, totals
 */

/** Aggregate an owner's billable state from their listings + payment history. */
async function buildPackStatus(supabase, userId) {
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, name, role, starter_used')
        .eq('id', userId)
        .maybeSingle();

    if (userErr) throw userErr;
    if (!user) return null;

    const { data: listings, error: listErr } = await supabase
        .from('listings')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

    if (listErr) throw listErr;

    const now = Date.now();
    const withState = (listings || []).map((l) => withVisibility(l, now));
    const visible = withState.filter((l) => l.is_visible);

    const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'paid');

    const totalSpent = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Soonest upcoming expiry among visible listings (drives "renew soon" nudges).
    const nextExpiry = visible
        .map((l) => l.visibility_expires_at)
        .filter(Boolean)
        .sort()[0] || null;

    return {
        user: { id: user.id, name: user.name, role: user.role },
        starter: {
            plan: getPlan('starter'),
            available: !user.starter_used,
        },
        summary: {
            total_listings: withState.length,
            visible_listings: visible.length,
            hidden_listings: withState.length - visible.length,
            next_expiry: nextExpiry,
            next_expiry_days: daysLeft(nextExpiry, now),
            total_spent: totalSpent,
        },
        listings: withState.map((l) => ({
            id: l.id,
            title: l.title,
            available: l.available,
            plan: l.plan,
            plan_name: l.plan_name,
            visibility_expires_at: l.visibility_expires_at,
            is_visible: l.is_visible,
            days_left: l.days_left,
            pack_status: l.pack_status,
        })),
    };
}

export async function handlePlans(request, supabase, path, url) {
    const method = request.method;

    // GET /api/plans
    if (method === 'GET' && path === '/api/plans') {
        const userId = url.searchParams.get('userId');
        const res = { plans: planList(), currency: 'INR' };

        if (userId) {
            const { data: user } = await supabase
                .from('users')
                .select('starter_used')
                .eq('id', userId)
                .maybeSingle();

            if (user) {
                res.starter_available = !user.starter_used;
            }
        }
        return json(res);
    }

    // GET /api/packs/:userId
    const packMatch = path.match(/^\/api\/packs\/([0-9a-f-]{36})$/);
    if (method === 'GET' && packMatch) {
        try {
            const status = await buildPackStatus(supabase, packMatch[1]);
            if (!status) return err('User not found', 404);
            return json(status);
        } catch (e) {
            return err(e.message, 500);
        }
    }

    return null; // route not matched
}
