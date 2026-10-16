import { json, err } from '../lib/response.js';
import { getPlan, addDays, withVisibility } from '../lib/plans.js';

/**
 * Demo payment routes — stand-ins until a real gateway is wired up.
 *
 * POST /api/payments/checkout  - Simulated payment that activates a pack on a listing
 * GET  /api/payments/:userId   - Payment history for an owner
 *
 * NOTE: this is a DEMO gateway. It always "succeeds" and creates a fake
 * reference. Swap `simulatePayment()` for a real provider integration later.
 */

const REJECTED_CARDS = ['4000000000000002'];

/** Pretend to charge a card. Always approved for the demo. */
function simulatePayment({ plan, method }) {
    if (REJECTED_CARDS.includes(String(method || '').replace(/\s/g, ''))) {
        return { ok: false, reason: 'Demo card declined' };
    }
    const reference = `DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
    return { ok: true, reference };
}

export async function handlePayments(request, supabase, path) {
    const method = request.method;

    // POST /api/payments/checkout  { user_id, listing_id, plan, method?, card? }
    if (method === 'POST' && path === '/api/payments/checkout') {
        const body = await request.json().catch(() => ({}));
        const { user_id, listing_id, plan: planId } = body;

        if (!user_id || !listing_id || !planId) {
            return err('user_id, listing_id, and plan are required');
        }

        const plan = getPlan(planId);
        if (!plan) return err(`Unknown pack "${planId}"`, 400);

        // Load the listing and make sure it belongs to this owner.
        const { data: listing, error: listErr } = await supabase
            .from('listings')
            .select('*')
            .eq('id', listing_id)
            .maybeSingle();

        if (listErr) return err(listErr.message, 500);
        if (!listing) return err('Listing not found', 404);
        if (listing.owner_id !== user_id) return err('You do not own this listing', 403);

        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('id, starter_used')
            .eq('id', user_id)
            .maybeSingle();

        if (userErr) return err(userErr.message, 500);
        if (!user) return err('User not found', 404);

        // The free Starter Pack can only be claimed once.
        if (plan.free && user.starter_used) {
            return err('Your free Starter Pack has already been used. Choose a paid pack.', 409);
        }

        // Run the (demo) charge.
        const charge = simulatePayment({ plan, method: body.method });
        if (!charge.ok) return err(charge.reason, 402);

        // Extend from the current expiry if the listing is still visible, so
        // renewals stack instead of restarting.
        const nowMs = Date.now();
        const currentExpiry = listing.visibility_expires_at
            ? new Date(listing.visibility_expires_at).getTime()
            : 0;
        const baseMs = currentExpiry > nowMs ? currentExpiry : nowMs;
        const expiresAt = addDays(plan.days, baseMs);

        const { data: updated, error: updateErr } = await supabase
            .from('listings')
            .update({
                plan: plan.id,
                visibility_expires_at: expiresAt,
                available: true,
            })
            .eq('id', listing_id)
            .select()
            .single();

        if (updateErr) return err(updateErr.message, 500);

        // Claim the starter pack so it can't be reused.
        if (plan.free) {
            await supabase.from('users').update({ starter_used: true }).eq('id', user_id);
        }

        const { data: payment, error: payErr } = await supabase
            .from('payments')
            .insert({
                user_id,
                listing_id,
                plan: plan.id,
                amount: plan.price,
                currency: 'INR',
                status: 'paid',
                method: 'demo',
                reference: charge.reference,
                days: plan.days,
                starts_at: new Date(nowMs).toISOString(),
                expires_at: expiresAt,
            })
            .select()
            .single();

        // A failed audit write must not hide a successful activation, but we
        // still surface it so the gap is visible.
        if (payErr) {
            return json(
                {
                    ok: true,
                    warning: `Payment recorded but history write failed: ${payErr.message}`,
                    listing: withVisibility(updated, nowMs),
                    payment: null,
                    pack: plan,
                },
                201
            );
        }

        return json(
            {
                ok: true,
                pack: plan,
                listing: withVisibility(updated, nowMs),
                payment,
            },
            201
        );
    }

    // GET /api/payments/:userId
    const userMatch = path.match(/^\/api\/payments\/([0-9a-f-]{36})$/);
    if (method === 'GET' && userMatch) {
        const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', userMatch[1])
            .order('created_at', { ascending: false });

        if (error) return err(error.message, 500);
        return json({ payments: data || [] });
    }

    return null; // route not matched
}
