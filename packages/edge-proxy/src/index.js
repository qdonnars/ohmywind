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
 */

// Public hostname -> Space hostname. The only place the backend is named.
const ORIGINS = {
  "mcp.ohmywind.fr": "qdonnars-openwind-mcp.hf.space",
  "mcp-dev.ohmywind.fr": "qdonnars-openwind-mcp-dev.hf.space",
};

export default {
  async fetch(request) {
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

    // `manual` keeps 3xx responses as data instead of chasing them ourselves,
    // which would drop the Host rewrite on the follow-up request.
    const response = await fetch(upstream, { redirect: "manual" });

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

    return response;
  },
};
