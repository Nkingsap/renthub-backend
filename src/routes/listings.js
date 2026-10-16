import { json, err } from '../lib/response.js';
import { withVisibility, addDays, getPlan } from '../lib/plans.js';

/**
 * Listings routes
 * GET    /api/listings              - All visible listings (search + filters)
 * POST   /api/listings              - Create a listing
 * PUT    /api/listings/:id          - Update a listing
 * DELETE /api/listings/:id          - Delete a listing
 * GET    /api/listings/owner/:id    - Listings by owner
 * GET    /api/listings/nearby       - Listings near a lat/lng
 * GET    /api/listings/favorites/:userId - Full listing objects for saved screen
 *
 * Visibility is driven by the owner's pack: a listing is served publicly only
 * while `visibility_expires_at` is in the future (see lib/plans.js).
 */
export async function handleListings(request, supabase, path, url) {
    const method = request.method;
    const nowIso = new Date().toISOString();

    // GET /api/listings  (public — only available, pack-active listings)
    if (method === 'GET' && path === '/api/listings') {
        const params = url.searchParams;
        let query = supabase
            .from('listings')
            .select('*')
            .eq('available', true)
            .gt('visibility_expires_at', nowIso);

        const search = params.get('q');
        if (search) {
            query = query.or(
                `title.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%`
            );
        }

        if (params.get('type')) query = query.eq('type', params.get('type'));
        if (params.get('minPrice')) query = query.gte('price', parseFloat(params.get('minPrice')));
        if (params.get('maxPrice')) query = query.lte('price', parseFloat(params.get('maxPrice')));
        if (params.get('bedrooms')) query = query.gte('bedrooms', parseInt(params.get('bedrooms')));

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) return err(error.message, 500);
        return json({ listings: data.map((l) => withVisibility(l)) });
    }

    // GET /api/listings/nearby?lat=&lng=&radius=
    if (method === 'GET' && path === '/api/listings/nearby') {
        const lat = parseFloat(url.searchParams.get('lat'));
        const lng = parseFloat(url.searchParams.get('lng'));
        const radius = parseFloat(url.searchParams.get('radius') || '10');

        if (isNaN(lat) || isNaN(lng)) return err('lat and lng are required');

        const latDelta = radius / 111;
        const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180));

        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .eq('available', true)
            .gt('visibility_expires_at', nowIso)
            .gte('latitude', lat - latDelta)
            .lte('latitude', lat + latDelta)
            .gte('longitude', lng - lngDelta)
            .lte('longitude', lng + lngDelta);

        if (error) return err(error.message, 500);
        return json({ listings: data.map((l) => withVisibility(l)) });
    }

    // GET /api/listings/owner/:ownerId  (owner dashboard — returns ALL listings, including unavailable)
    const ownerMatch = path.match(/^\/api\/listings\/owner\/(.+)$/);
    if (method === 'GET' && ownerMatch) {
        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .eq('owner_id', ownerMatch[1])
            .order('created_at', { ascending: false });

        if (error) return err(error.message, 500);
        // Dashboard sees every listing, including hidden/expired ones, with status.
        return json({ listings: data.map((l) => withVisibility(l)) });
    }

    // GET /api/listings/favorites/:userId — full listing objects for SavedScreen
    const favListingsMatch = path.match(/^\/api\/listings\/favorites\/(.+)$/);
    if (method === 'GET' && favListingsMatch) {
        const { data, error } = await supabase
            .from('favorites')
            .select('listings(*)')
            .eq('user_id', favListingsMatch[1]);

        if (error) return err(error.message, 500);
        // Renters should never see listings whose pack has lapsed.
        return json({
            listings: data
                .map((f) => f.listings)
                .filter(Boolean)
                .map((l) => withVisibility(l))
                .filter((l) => l.is_visible),
        });
    }

    // POST /api/listings
    if (method === 'POST' && path === '/api/listings') {
        const body = await request.json();
        const { owner_id, title, price, address, city } = body;

        if (!owner_id || !title || !price || !address || !city) {
            return err('owner_id, title, price, address, and city are required');
        }

        const { data: owner } = await supabase
            .from('users')
            .select('id, starter_used')
            .eq('id', owner_id)
            .maybeSingle();

        if (!owner) return err('Owner not found', 404);

        // Business model: an owner's first listing is covered by the free
        // Starter Pack (30 days). Later listings start hidden until a pack is
        // purchased via /api/payments/checkout.
        const starterPlan = getPlan('starter');
        const starterGranted = !owner.starter_used;
        const planId = starterGranted ? starterPlan.id : null;
        const visibilityExpiresAt = starterGranted ? addDays(starterPlan.days) : null;

        const { data, error } = await supabase
            .from('listings')
            .insert({
                owner_id,
                title,
                description: body.description,
                price,
                type: body.type || 'apartment',
                bedrooms: body.bedrooms,
                bathrooms: body.bathrooms,
                area: body.area,
                address,
                city,
                latitude: body.latitude,
                longitude: body.longitude,
                amenities: body.amenities || [],
                images: body.images || [],
                furnished: body.furnished || false,
                available: true,
                plan: planId,
                visibility_expires_at: visibilityExpiresAt,
            })
            .select()
            .single();

        if (error) return err(error.message, 500);

        if (starterGranted) {
            await supabase.from('users').update({ starter_used: true }).eq('id', owner_id);
        }

        const listing = withVisibility(data);
        return json(
            {
                listing,
                pack_granted: starterGranted ? starterPlan : null,
                needs_pack: !listing.is_visible,
            },
            201
        );
    }

    // PUT /api/listings/:id  |  DELETE /api/listings/:id
    // NOTE: must come AFTER all named sub-routes (/nearby, /owner/:id, /favorites/:id)
    const listingIdMatch = path.match(/^\/api\/listings\/([0-9a-f-]{36})$/);
    if (listingIdMatch) {
        const id = listingIdMatch[1];

        if (method === 'PUT') {
            const body = await request.json();
            // Pack + visibility fields belong to the billing flow, never the client.
            const { plan, visibility_expires_at, owner_id, id: _id, ...safe } = body;
            const { data, error } = await supabase
                .from('listings')
                .update(safe)
                .eq('id', id)
                .select()
                .single();

            if (error) return err(error.message, 500);
            return json({ listing: withVisibility(data) });
        }

        if (method === 'DELETE') {
            const { error } = await supabase.from('listings').delete().eq('id', id);
            if (error) return err(error.message, 500);
            return json({ success: true });
        }
    }

    return null; // route not matched
}
