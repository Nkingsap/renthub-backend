// ─── Packs (Business Model) ───────────────────────────────────────────────────
// Owners pay for the amount of time a listing stays visible in the app.
// New owners get one free "Starter Pack" listing valid for 30 days.
// When a pack expires the listing stops being served publicly.

export const PLANS = {
    starter: {
        id: 'starter',
        name: 'Starter Pack',
        price: 0,
        days: 30,
        durationLabel: '30 days',
        tag: 'Free',
        free: true,
        listingLimit: 1,
        description: 'On the house — your first listing is live free for 30 days.',
    },
    basic: {
        id: 'basic',
        name: 'Basic',
        price: 99,
        days: 7,
        durationLabel: '7 days',
        listingLimit: 1,
        description: 'A quick 7-day visibility boost for one listing.',
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 299,
        days: 30,
        durationLabel: '1 month',
        tag: 'Popular',
        listingLimit: 1,
        description: 'Keep one listing visible for a full month.',
    },
    ultra: {
        id: 'ultra',
        name: 'Ultra',
        price: 599,
        days: 90,
        durationLabel: '3 months',
        tag: 'Best value',
        listingLimit: 1,
        description: 'Lock in three months of visibility at the lowest rate.',
    },
};

// Display order for the pack picker.
export const PLAN_ORDER = ['starter', 'basic', 'pro', 'ultra'];

/** Returns the pack catalog as an ordered array (safe to send to clients). */
export function planList() {
    return PLAN_ORDER.map((id) => ({ ...PLANS[id] }));
}

/** Look up a pack by id; returns null for unknown ids. */
export function getPlan(id) {
    if (!id) return null;
    return PLANS[String(id).toLowerCase()] || null;
}

/** Returns an ISO timestamp `days` after `fromMs` (defaults to now). */
export function addDays(days, fromMs = Date.now()) {
    return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Whole days remaining until `expiresAt` (never negative). */
export function daysLeft(expiresAt, nowMs = Date.now()) {
    if (!expiresAt) return 0;
    const diff = new Date(expiresAt).getTime() - nowMs;
    if (isNaN(diff) || diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * Attach business-model status to a listing row.
 * A listing is publicly visible only when it is marked available AND its pack
 * (visibility window) has not expired.
 */
export function withVisibility(listing, nowMs = Date.now()) {
    if (!listing) return listing;
    const expiresAt = listing.visibility_expires_at || null;
    const isVisible =
        listing.available !== false &&
        !!expiresAt &&
        new Date(expiresAt).getTime() > nowMs;

    const plan = getPlan(listing.plan);
    const remaining = daysLeft(expiresAt, nowMs);

    return {
        ...listing,
        plan: listing.plan || null,
        plan_name: plan ? plan.name : listing.plan || 'No pack',
        visibility_expires_at: expiresAt,
        is_visible: isVisible,
        days_left: remaining,
        // Convenience status for UI badges.
        pack_status: !expiresAt
            ? 'unpaid'
            : isVisible
                ? (remaining <= 3 ? 'expiring' : 'active')
                : 'expired',
    };
}

export default { PLANS, PLAN_ORDER, planList, getPlan, addDays, daysLeft, withVisibility };
