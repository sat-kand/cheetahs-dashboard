/**
 * Cloudflare Worker: PlayHQ API proxy for the Cheetahs dashboard.
 *
 * The dashboard is a static page with no server of its own, so it can never
 * hold the PlayHQ API key - anything in index.html's JS is visible to anyone
 * who views the page source. This worker sits in between: it holds the key
 * as a Cloudflare secret, forwards a small allow-listed set of read-only
 * PlayHQ endpoints, and sends the response back with CORS headers so the
 * dashboard (running on a different origin) can read it.
 *
 * It deliberately does NOT behave like a generic "forward anything" proxy -
 * only the exact path shapes the dashboard actually uses are allowed, so a
 * leaked worker URL can't be used to explore the rest of PlayHQ's API with
 * our credentials.
 */

const PLAYHQ_BASE = "https://api.playhq.com";

// UUID shape, loosely - good enough to stop path-shape abuse without being
// fussy about which UUID version PlayHQ actually issues.
const UUID = "[0-9a-fA-F-]{8,40}";

// Each entry: a RegExp the incoming pathname must fully match, with the
// capture group(s) reused verbatim when building the upstream PlayHQ URL.
// Keep this list to exactly what the dashboard calls - see README.md.
const ALLOWED = [
  new RegExp(`^/v1/organisations/${UUID}/seasons$`),
  new RegExp(`^/v1/seasons/${UUID}/teams$`),
  new RegExp(`^/v1/seasons/${UUID}/grades$`),
  new RegExp(`^/v1/teams/${UUID}/fixture$`),
  new RegExp(`^/v1/grades/${UUID}/fixture$`),
  new RegExp(`^/v2/grades/${UUID}/fixture$`),
  new RegExp(`^/v1/grades/${UUID}/ladder$`),
  new RegExp(`^/v2/grades/${UUID}/ladder$`),
  new RegExp(`^/v1/games/${UUID}/summary$`),
  new RegExp(`^/v2/games/${UUID}/summary$`),
];

// Origins allowed to call this worker from a browser. Add any local dev
// origins here too (e.g. "http://localhost:8080") while testing.
const ALLOWED_ORIGINS = new Set([
  "https://sat-kand.github.io",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const url = new URL(request.url);
    const matched = ALLOWED.some((re) => re.test(url.pathname));
    if (!matched) {
      return new Response(JSON.stringify({ error: "Not a recognised endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (!env.PLAYHQ_API_KEY) {
      return new Response(JSON.stringify({ error: "Worker is missing PLAYHQ_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const upstream = PLAYHQ_BASE + url.pathname + url.search;
    const upstreamResp = await fetch(upstream, {
      method: "GET",
      headers: {
        "x-api-key": env.PLAYHQ_API_KEY,
        // Must be lowercase - PlayHQ's gateway is case-sensitive on this value.
        "x-phq-tenant": (env.PLAYHQ_TENANT || "ca").toLowerCase(),
        Accept: "application/json",
      },
      // Keep PlayHQ's own cache headers from leaking stale LIVE match data;
      // a short edge cache is fine for finished rounds, so let Cloudflare
      // use its default caching behaviour for GET rather than forcing "no-store".
    });

    const body = await upstreamResp.text();
    return new Response(body, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": upstreamResp.headers.get("Content-Type") || "application/json",
        ...cors,
      },
    });
  },
};
