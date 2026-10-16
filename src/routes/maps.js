import { json, err } from '../lib/response.js';

/**
 * Maps / Geocoding routes
 * GET /api/maps/geocode?address=   - Convert address to lat/lng via Google Maps
 */
export async function handleMaps(request, env, path, url) {
    const method = request.method;

    // GET /api/maps/geocode?address=
    if (method === 'GET' && path === '/api/maps/geocode') {
        const address = url.searchParams.get('address');
        if (!address) return err('address is required');

        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${env.GOOGLE_MAPS_API_KEY}`;
        const resp = await fetch(googleUrl);
        const data = await resp.json();

        if (data.status !== 'OK') {
            return err(`Geocoding failed: ${data.status}`, 400);
        }

        const { lat, lng } = data.results[0].geometry.location;
        const formatted = data.results[0].formatted_address;
        return json({ latitude: lat, longitude: lng, formatted_address: formatted });
    }

    return null; // route not matched
}
