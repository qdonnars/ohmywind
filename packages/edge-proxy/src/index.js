// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Reverse proxy putting our own domain in front of the MCP Spaces.
 *
 * Why this exists: MCP clients store the endpoint URL in their config. As long
 * as that URL is a `*.hf.space` hostname, we do not control it, and anything
 * that changes it (renaming the Space, moving off Hugging Face) breaks every
 * client at once. Fronting the Spaces with `mcp.ohmywind.fr` makes the backend
 * an implementation detail: changing it is one edit to ORIGINS below.
 *
 * Hugging Face routes Spaces by Host header, so the proxy has to present the
 * origin's own hostname upstream. That happens implicitly: the runtime derives
 * `Host` from the request URL, so rewriting the URL's hostname is enough. There
 * is no way to set `Host` directly in a Worker, and no need to.
 *
 * Beyond the rewrite, this Worker owns three things the origin cannot do for
 * itself, because they all apply when the origin is not answering, or before
 * the request ever reaches it:
 *
 *   1. an origin outage becomes a JSON error the browser is allowed to read,
 *      instead of an HTML page from Cloudflare with no CORS headers on it;
 *   2. the three long-lived GETs are kept in the edge cache, which a Worker
 *      subrequest to a non-Cloudflare origin never populates on its own;
 *   3. a `scheduled` handler can keep the free Spaces awake. It ships wired but
 *      disabled: see the commented `[triggers]` block in `wrangler.toml`.
 */

// Public hostname -> Space hostname. The only place the backend is named.
const ORIGINS = {
  "mcp.ohmywind.fr": "qdonnars-openwind-mcp.hf.space",
  "mcp-dev.ohmywind.fr": "qdonnars-openwind-mcp-dev.hf.space",
};

// Browser origins we name explicitly when we answer for ourselves.
//
// The API is public and keyless, so `*` is a correct answer for every caller;
// echoing the known ones only keeps our responses the same shape as the
// origin's, and leaves the door open for a credentialed endpoint one day (`*`
// is illegal with credentials, an echo is not). Anything else, including a
// request with no Origin at all (curl, an MCP client), gets `*` rather than
// nothing: a missing header is what turns a readable error into an opaque one.
const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://ohmywind.fr",
  "https://www.ohmywind.fr",
  "https://dev.ohmywind.fr",
  "http://localhost:5173",
  "http://localhost:4173",
]);

// GETs worth keeping at the edge. All three are derived from data compiled
// into the image: they change when a build ships, and a build restarts the
// deployment. The origin already says so with `Cache-Control: public,
// max-age=86400` (300 s for an empty coverage answer), but that header alone
// caches nothing here: a Worker subrequest to an origin outside Cloudflare is
// not cached unless the Worker asks, which is why every one of these was
// measured `cf-cache-status: DYNAMIC` through the proxy on 2026-09-01.
//
// Anything else is left alone. `/mcp` is a transport, and every other
// `/api/v1/` route is either a POST or depends on the moment it is asked.
const CACHEABLE_PATHS = new Set([
  "/api/v1/archetypes",
  "/api/v1/marine/marc",
  "/api/v1/marine/marc/coverage",
]);

// Seconds we ask the caller to wait when the origin is unreachable. A cold
// Hugging Face container takes a few seconds; a rebuild takes a minute or so.
const UNAVAILABLE_RETRY_AFTER = 30;

export default {
  async fetch(request, env, ctx) {
    const incoming = new URL(request.url);
    const origin = ORIGINS[incoming.hostname];
    if (!origin) {
      // A route was attached to a hostname this map does not know about.
      // Failing loudly beats proxying somewhere unintended.
      return new Response("Unknown host\n", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Edge cache, read side. Only ever consulted for the handful of GETs
    // listed above, so `/mcp` and every POST reach the origin as before.
    const cacheable =
      request.method === "GET" && CACHEABLE_PATHS.has(incoming.pathname);
    if (cacheable) {
      const hit = await caches.default.match(request);
      if (hit) return finish(hit, request, "HIT");
    }

    const upstreamUrl = new URL(request.url);
    upstreamUrl.protocol = "https:";
    upstreamUrl.hostname = origin;
    upstreamUrl.port = "";

    // Constructing a new Request is what makes the headers mutable; the
    // incoming request's are frozen. Method, body and the body's streaming
    // nature are carried over, so SSE and chunked responses still stream.
    const upstream = new Request(upstreamUrl, request);

    // Collapse X-Forwarded-For to the single address Cloudflare vouches for.
    //
    // Cloudflare *appends* the real client to whatever XFF the caller sent, so
    // a caller can pad the list and shift the positions the origin counts from.
    // The Space resolves the client IP by counting entries from the right
    // (OPENWIND_TRUSTED_PROXY_HOPS), so a padded list means a wrong rate-limit
    // key. Overwriting with CF-Connecting-IP makes the chain reaching the app
    // exactly `<client>, <cloudflare egress>`: deterministic, and unspoofable
    // because CF-Connecting-IP is set by the edge, not by the caller.
    //
    // This is what pins OPENWIND_TRUSTED_PROXY_HOPS to 2 on both Spaces. Left
    // at 1, the app reads Cloudflare's egress IP and every user in the world
    // shares one rate-limit bucket.
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp) {
      upstream.headers.set("X-Forwarded-For", clientIp);
    } else {
      upstream.headers.delete("X-Forwarded-For");
    }

    // Vouch for this request, so the origin knows the chain above was written
    // by us and can safely count two hops from the right.
    //
    // Without proof, the origin cannot tell our traffic apart from someone
    // calling the Space directly on its *.hf.space hostname with a
    // hand-written X-Forwarded-For — and that caller would get to pick their
    // own rate-limit bucket, which was measured working on 2026-08-01.
    //
    // The delete is not optional: strip whatever the caller sent before
    // setting ours, otherwise the header proves nothing.
    upstream.headers.delete("X-OhMyWind-Edge");
    if (env?.EDGE_SHARED_SECRET) {
      upstream.headers.set("X-OhMyWind-Edge", env.EDGE_SHARED_SECRET);
    }

    // `manual` keeps 3xx responses as data instead of chasing them ourselves,
    // which would drop the Host rewrite on the follow-up request.
    //
    // The try/catch is the difference between a readable failure and an opaque
    // one. `fetch` throws when the origin cannot be reached at all: Space
    // asleep past the Worker's own timeout, Space rebuilding, DNS or TLS gone.
    // Cloudflare then answers with an HTML 1101/52x page carrying no CORS
    // header, so the browser reports a CORS failure and the web app never sees
    // a status, a body, or a reason. Measured 2026-09-01, annex D finding 6.
    let response;
    try {
      response = await fetch(upstream, { redirect: "manual" });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "upstream unreachable",
          host: incoming.hostname,
          origin,
          path: incoming.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return unavailable(request, 503);
    }

    // A redirect whose Location still names the Space would hand the origin
    // hostname straight back to the client, undoing the whole point of this
    // proxy. Rewrite it back to the public hostname.
    const location = response.headers.get("Location");
    if (location && location.includes(origin)) {
      const rewritten = new Response(response.body, response);
      rewritten.headers.set(
        "Location",
        location.replaceAll(origin, incoming.hostname),
      );
      return rewritten;
    }

    // An origin that answers, but with a platform error page rather than with
    // its own JSON: same treatment as an unreachable one, so the web app has a
    // single shape to handle.
    if (isPlatformOutage(incoming, response)) {
      console.error(
        JSON.stringify({
          message: "upstream outage page",
          host: incoming.hostname,
          path: incoming.pathname,
          status: response.status,
        }),
      );
      return unavailable(request, response.status);
    }

    if (cacheable) return store(request, response, ctx);

    return response;
  },

  /**
   * Keep-alive ping. **Disabled on purpose**: `wrangler.toml` ships with its
   * `[triggers]` block commented out, so this handler never runs today.
   *
   * The April 2026 product decision (plan/02-decisions.md, section 4) was "no
   * pre-warming, we accept the cold start of a few seconds". What has changed
   * since is the size of that wait: a free Space sleeps after 48 h, and waking
   * a sleeping container is not a few seconds, it is long enough for the fetch
   * above to give up and answer a 503. Wiring the handler now, off, makes
   * enabling it a one-line edit whenever that trade is worth revisiting, and
   * keeps the decision next to its consequence.
   */
  async scheduled(controller, env, ctx) {
    const targets = Object.values(ORIGINS).map(
      (host) => `https://${host}/api/v1/archetypes`,
    );
    const results = await Promise.allSettled(
      // The cheapest route that still touches the app: a table compiled into
      // the image, no upstream call, no atlas read. Enough to reset the idle
      // timer, and it goes straight to the Space, not through this Worker, so
      // the edge cache never answers it.
      targets.map((url) => fetch(url, { redirect: "manual" })),
    );
    results.forEach((result, index) => {
      console.log(
        JSON.stringify({
          message: "keepalive ping",
          cron: controller.cron,
          url: targets[index],
          ok: result.status === "fulfilled",
          status: result.status === "fulfilled" ? result.value.status : null,
          error: result.status === "rejected" ? String(result.reason) : undefined,
        }),
      );
    });
  },
};

/**
 * Is this an error page from the platform, or an error from the app?
 *
 * The API answers some of its own failures with 503 and a JSON body carrying a
 * stable `code` (`upstream_timeout`, `upstream_rate_limited`), which the web
 * app already maps to French copy. Rewriting those would replace a precise
 * message with a vague one, so the content type is the discriminator: JSON is
 * the app talking, anything else is Hugging Face or Cloudflare talking.
 *
 * `/mcp` is deliberately out of scope. The MCP transport has to see the status
 * the origin really returned, in the shape it really returned it.
 */
function isPlatformOutage(url, response) {
  if (!url.pathname.startsWith("/api/v1/")) return false;
  if (
    response.status !== 502 &&
    response.status !== 503 &&
    response.status !== 504
  ) {
    return false;
  }
  const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
  return !type.includes("application/json");
}

/**
 * The one failure answer this Worker writes itself.
 *
 * Shape matches the API's own error contract (`error`, `code`, `retry_after`),
 * so the web app has a single path to follow. The status of a translated page
 * is kept as the origin sent it; a thrown fetch, which has no status of its
 * own, becomes a 503.
 */
function unavailable(request, status) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  applyCors(headers, request);
  headers.set("Retry-After", String(UNAVAILABLE_RETRY_AFTER));

  // A preflight has to be answered even when the origin is down, otherwise the
  // browser refuses to send the request it precedes and the caller never
  // reaches the JSON below: they get "Failed to fetch" and no reason. The web
  // app sends `Content-Type: application/json` on /api/v1/passage, which is
  // not a safelisted value, so every plan request is preceded by one of these.
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      request.headers.get("Access-Control-Request-Headers") ?? "Content-Type",
    );
    return new Response(null, { status: 204, headers });
  }

  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(
    JSON.stringify({
      error: "backend temporarily unavailable",
      code: "upstream_unavailable",
      retry_after: UNAVAILABLE_RETRY_AFTER,
    }),
    { status, headers },
  );
}

/**
 * Store a cacheable response, then hand the caller its copy.
 *
 * `cache.put` honours the response's own `Cache-Control`, so the origin keeps
 * ownership of the TTL: 86400 s on the archetype table and on a MARC answer,
 * 300 s on an empty coverage answer. Nothing here re-decides it.
 */
function store(request, response, ctx) {
  const maxAge = publicMaxAge(response);
  if (response.status === 200 && maxAge !== null) {
    // clone() first: handing `response.body` to another Response disturbs the
    // stream, and a disturbed body can no longer be cloned.
    const copy = response.clone();
    const stored = new Response(copy.body, copy);

    // The CORS headers are the one thing that must not be shared between
    // callers. Hugging Face's edge rewrites them on every response, echoing
    // the Origin we forwarded, and `caches.default` keys on the URL alone: it
    // does not honour `Vary: Origin`. Cached as received, the first caller's
    // Origin would be handed to everyone after them, and a dev.ohmywind.fr
    // session would break on an entry warmed from localhost. So the stored
    // copy carries none, and `finish` stamps them per request.
    stored.headers.delete("Access-Control-Allow-Origin");
    stored.headers.delete("Access-Control-Expose-Headers");

    ctx.waitUntil(caches.default.put(request, stored));
  }
  return finish(response, request, "MISS");
}

/**
 * Stamp the outgoing response: cache state, then CORS.
 *
 * HIT means the body came from the edge. MISS means it came from the origin,
 * whether or not it was then worth storing.
 */
function finish(response, request, state) {
  const out = new Response(response.body, response);
  out.headers.set("X-OhMyWind-Edge-Cache", state);
  applyCors(out.headers, request);
  return out;
}

/** CORS for a response this Worker owns, cached or synthesised. */
function applyCors(headers, request) {
  const origin = request.headers.get("Origin");
  headers.set(
    "Access-Control-Allow-Origin",
    origin && ALLOWED_BROWSER_ORIGINS.has(origin) ? origin : "*",
  );
  headers.set("Vary", withVary(headers.get("Vary"), "Origin"));
  // Retry-After and X-Request-Id are the origin's own list; the cache state
  // joins it so the header can be read from a page, not only from curl.
  headers.set(
    "Access-Control-Expose-Headers",
    "Retry-After, X-Request-Id, X-OhMyWind-Edge-Cache",
  );
}

function withVary(existing, field) {
  if (!existing) return field;
  const listed = existing
    .split(",")
    .some((entry) => entry.trim().toLowerCase() === field.toLowerCase());
  return listed ? existing : `${existing}, ${field}`;
}

/**
 * The response's max-age, if and only if it says a shared cache may keep it.
 *
 * A gate, not a TTL: the Cache API reads the header itself. Returning the
 * number keeps the decision readable and testable, and `cache.put` answers 413
 * rather than storing anything if we ever get this wrong.
 */
function publicMaxAge(response) {
  const value = response.headers.get("Cache-Control");
  if (!value) return null;
  const directives = value
    .toLowerCase()
    .split(",")
    .map((entry) => entry.trim());
  if (!directives.includes("public")) return null;
  if (
    directives.includes("private") ||
    directives.includes("no-store") ||
    directives.includes("no-cache")
  ) {
    return null;
  }
  const maxAge = directives.find((entry) => entry.startsWith("max-age="));
  if (!maxAge) return null;
  const seconds = Number(maxAge.slice("max-age=".length));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
