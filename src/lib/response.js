// ─── CORS ─────────────────────────────────────────────────────────────────────
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}

export function err(message, status = 400) {
    return json({ error: message }, status);
}

export function corsPreflightResponse() {
    return new Response(null, { headers: corsHeaders });
}
