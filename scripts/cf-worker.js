/**
 * TabSync — Cloudflare Worker: Firestore REST Proxy
 *
 * Deploy once to Cloudflare Workers (free tier).
 * Set environment variable:  FIREBASE_API_KEY = <your key>
 *
 * Usage:
 *   wrangler secret put FIREBASE_API_KEY
 *   wrangler deploy --name tabsync-proxy
 *
 * Then set "Proxy URL" in TabSync settings to:
 *   https://tabsync-proxy.<your-subdomain>.workers.dev
 */

const FIRESTORE_BASE = 'https://firestore.googleapis.com';

export default {
  async fetch(request, env) {
    // ── CORS pre-flight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);

    // Only proxy /v1/ paths
    if (!url.pathname.startsWith('/v1/')) {
      return new Response('Not found', { status: 404 });
    }

    // Inject API key server-side (never expose it in client requests)
    url.hostname = 'firestore.googleapis.com';
    url.protocol = 'https:';
    url.port = '';
    url.searchParams.set('key', env.FIREBASE_API_KEY ?? '');

    // Forward the request
    const upstream = new Request(url.toString(), {
      method: request.method,
      headers: forwardHeaders(request.headers),
      body: ['GET', 'HEAD', 'DELETE'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    });

    let resp;
    try {
      resp = await fetch(upstream);
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }

    // Stream the response back with CORS headers added
    const respHeaders = new Headers(resp.headers);
    const cors = corsHeaders(request);
    for (const [k, v] of Object.entries(cors)) {
      respHeaders.set(k, v);
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────

function corsHeaders(request) {
  const origin = request.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function forwardHeaders(incoming) {
  const out = new Headers();
  for (const [k, v] of incoming.entries()) {
    // Strip hop-by-hop and browser-injected headers that confuse upstream
    const lower = k.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'cf-connecting-ip' ||
      lower === 'cf-ipcountry' ||
      lower === 'cf-ray' ||
      lower === 'cf-visitor' ||
      lower === 'x-forwarded-for' ||
      lower === 'x-forwarded-proto'
    ) continue;
    out.set(k, v);
  }
  return out;
}
