import { json, err } from '../lib/response.js';

/**
 * Favorites routes
 * GET  /api/favorites/:userId       - Get favorited listing IDs for a user
 * POST /api/favorites/toggle        - Toggle a favorite { user_id, listing_id }
 */
export async function handleFavorites(request, supabase, path) {
    const method = request.method;

    // GET /api/favorites/:userId
    const favUserMatch = path.match(/^\/api\/favorites\/(.+)$/);
    if (method === 'GET' && favUserMatch) {
        const { data, error } = await supabase
            .from('favorites')
            .select('listing_id')
            .eq('user_id', favUserMatch[1]);

        if (error) return err(error.message, 500);
        return json({ favorites: data.map((f) => f.listing_id) });
    }

    // POST /api/favorites/toggle
    if (method === 'POST' && path === '/api/favorites/toggle') {
        const { user_id, listing_id } = await request.json();
        if (!user_id || !listing_id) return err('user_id and listing_id are required');

        // Check if already favorited
        const { data: existing } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user_id)
            .eq('listing_id', listing_id)
            .single();

        if (existing) {
            await supabase.from('favorites').delete().eq('id', existing.id);
            return json({ favorited: false });
        } else {
            await supabase.from('favorites').insert({ user_id, listing_id });
            return json({ favorited: true });
        }
    }

    return null; // route not matched
}
