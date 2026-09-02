# edge-proxy

Cloudflare Worker that serves the MCP endpoint on our own domain.

| Public URL | Origin |
| --- | --- |
| `https://mcp.ohmywind.fr/mcp` | `qdonnars-openwind-mcp.hf.space` |
| `https://mcp-dev.ohmywind.fr/mcp` | `qdonnars-openwind-mcp-dev.hf.space` |

## Why

MCP clients store the endpoint URL in their config. While that URL is a
`*.hf.space` hostname we do not own it, so anything that changes it breaks every
client at once. That is not hypothetical: renaming the prod Space on 2026-08-01
took the endpoint down, because three separate systems referenced the Space
hostname and a rename desynchronised all of them.

With the proxy in front, the Space name becomes an implementation detail. Moving
to Fly, Scaleway or a VPS later is one edit to `ORIGINS` in `src/index.js`, and
no user changes anything.

This also unblocks listing in the official MCP registry: the URL published there
gets copied into directories, articles and user configs we do not control, so it
has to be one we can keep.

## Deploy

Dashboard: Workers & Pages -> Create -> Worker, paste `src/index.js`, deploy,
then attach both routes from `wrangler.toml` under the Worker's Settings ->
Domains & Routes.

Or with wrangler, from this directory:

```sh
npx wrangler deploy
```

The routes in `wrangler.toml` are applied on deploy. `zone_name` must stay
`ohmywind.fr`.

## When the origin is unreachable

`fetch` throws when the Space cannot be reached at all: asleep past the Worker's
own timeout, rebuilding, DNS or TLS gone. Left uncaught, Cloudflare answers with
an HTML 1101/52x page that carries no CORS header, so the browser reports a CORS
failure and the web app never sees a status, a body or a reason.

The Worker answers instead, with the same error contract as the API:

```json
{ "error": "backend temporarily unavailable", "code": "upstream_unavailable", "retry_after": 30 }
```

`503`, `Content-Type: application/json`, `Retry-After: 30`, `Cache-Control:
no-store`, and the CORS headers the browser needs to let the page read it:
`Access-Control-Allow-Origin` echoes the caller when it is one of
`ohmywind.fr`, `www.ohmywind.fr`, `dev.ohmywind.fr`, `localhost:5173` or
`localhost:4173`, and is `*` otherwise (the API is public and keyless, so the
wildcard is a correct answer for anyone else, and a missing header is what makes
a failure opaque).

Two details that are easy to get wrong and are covered by the tests:

- **A preflight is answered too.** The web app sends `Content-Type:
  application/json` on `POST /api/v1/passage`, so every plan request is preceded
  by an `OPTIONS`. If that preflight fails, the browser never sends the POST and
  the caller gets "Failed to fetch" instead of the JSON above. During an outage
  the Worker answers it itself with a `204`.
- **A status the origin really sent is never rewritten on `/mcp`.** The MCP
  transport has to see it in the shape it came in, so the translation below
  applies to `/api/v1/` only. A throw is different: there is no status to
  preserve, so every path, `/mcp` included, gets the JSON above rather than an
  HTML page.

An origin that answers with a platform error page (`502`, `503`, `504` whose
body is not JSON) gets the same treatment, keeping its status. An error the app
itself produced is left alone: the API answers some failures with `503` and a
JSON body carrying `upstream_timeout` or `upstream_rate_limited`, which the web
app maps to precise French copy. Content type is the discriminator.

The web app has to learn `upstream_unavailable`: it is not in `ERROR_COPY` in
`packages/web/src/api/passage.ts` yet, and the text fallback does not catch it
either (it matches `Erreur serveur 5xx`, not this body), so today the reader
would see the raw English sentence. One line to add there, in the shape the
neighbouring entries use so the delay is never hard-coded twice:

```ts
upstream_unavailable: (retryAfter) =>
  `Le serveur est momentanément injoignable, il redémarre peut-être. ${formatRetryDelay(retryAfter)}`,
```

## Edge cache

Three GETs are worth keeping at the edge. All three are derived from data
compiled into the image, so they only change when a build ships, and a build
restarts the deployment:

| Path | TTL from the origin |
| --- | --- |
| `/api/v1/archetypes` | `public, max-age=86400` |
| `/api/v1/marine/marc/coverage` | `public, max-age=86400`, `300` when the answer is empty |
| `/api/v1/marine/marc` (with query) | `public, max-age=86400` |

The origin already said all of this, and none of it was happening: a Worker
subrequest to an origin outside Cloudflare is not cached unless the Worker asks,
so all three were measured `cf-cache-status: DYNAMIC` through the proxy on
2026-09-01. The Worker now uses the Cache API explicitly: `caches.default.match`
first, and on a miss `ctx.waitUntil(cache.put(...))` when the response is a
`200` carrying `Cache-Control: public, max-age=N`. The TTL is not re-decided
here: `cache.put` reads the origin's own header, so changing the number stays a
one-line change in `packages/api`.

Never cached: any POST, anything under `/mcp`, any non-200, anything without a
public `max-age`.

`caches.default` keys on the full URL, hostname included, so `mcp` and `mcp-dev`
never share an entry, and the query string of `/marine/marc` is part of the key.

`X-OhMyWind-Edge-Cache` reports the outcome, `HIT` for a body served by the
edge, `MISS` for one that came from the origin:

```sh
curl -sSI https://mcp-dev.ohmywind.fr/api/v1/archetypes | grep -i 'x-ohmywind-edge-cache\|cache-control'
# first call:  x-ohmywind-edge-cache: MISS
# second call: x-ohmywind-edge-cache: HIT
```

A hit is per data centre, so the second call has to leave from the same place as
the first. Testing from a phone on mobile data right after a laptop on wifi can
legitimately show two misses.

One subtlety worth keeping in mind before adding a path to the list: Hugging
Face's edge rewrites the CORS headers on every response, echoing back the
`Origin` we forwarded, and the Cache API keys on the URL alone (it does not
honour `Vary: Origin`). Cached as received, the first caller's `Origin` would be
served to everyone after them, and a `dev.ohmywind.fr` session would break on an
entry warmed from `localhost`. So the stored copy carries no
`Access-Control-Allow-Origin` and the Worker stamps one per request.

## Observability

`[observability] enabled = true` with `head_sampling_rate = 1` in
`wrangler.toml`. Traffic here is a few requests a minute, so everything is
sampled; lower the rate if that changes. The Worker logs one structured JSON
line per unreachable origin and per outage page, and one per keep-alive ping if
that is ever switched on. Logs are in the dashboard under the Worker's
Observability tab, and are kept 7 days.

## Keep-alive, delivered off

A free Space sleeps after 48 h of inactivity. The `scheduled` handler in
`src/index.js` would ping `/api/v1/archetypes` on both Spaces (a table compiled
into the image: no upstream call, no atlas read) and keep them warm.

It is wired but not enabled: the `[triggers]` block in `wrangler.toml` is
commented out, because the April 2026 product decision was the opposite, no
pre-warming, accept the cold start of a few seconds
(`plan/02-decisions.md`, section 4). What has changed since is the size of that
wait: a container that has slept for 48 h takes long enough to wake that the
Worker's own fetch can give up, which is now a `503` rather than an opaque
failure, but still a failure.

To turn it on: uncomment the two lines and redeploy.

```toml
[triggers]
crons = ["*/30 * * * *"]
```

To turn it off again later, set `crons = []` and redeploy. Commenting the key
out does not remove a trigger already registered on a deployed Worker.

Cost, for the decision: 48 invocations a day per Space, which is nothing against
the free plan's 100 000 requests a day, and 2 requests every 30 minutes against
the origin's rate limiter, keyed on Cloudflare's egress address.

## Rate limiting at the edge

Not code, and not in this repository: a Rate Limiting rule is a dashboard
setting, under Security -> WAF -> Rate limiting rules on the `ohmywind.fr` zone.
Suggested first rule, which fits in the single rule the free plan allows:

- **Match**: `http.host eq "mcp.ohmywind.fr" and http.request.method eq "POST"
  and starts_with(http.request.uri.path, "/api/v1/passage")`
- **Counting**: 60 requests per 1 minute, per client IP
- **Action**: block for 1 minute (or managed challenge, which is friendlier to a
  shared NAT)

The number is deliberately above the origin's own limiter (30 requests per
60 s per bucket, in `packages/api/src/openwind_api/security.py`) rather than
below it. The origin's limiter is the precise one: it keys on a normalised
network (`/32` for IPv4, `/64` for IPv6) and answers a `429` with `Retry-After`
and a `code` the web app turns into French copy. The edge rule is a coarse
first line, there to shed a flood before it costs a Worker invocation and a
request to a small free container. Set it under the origin's threshold and the
edge would answer first, with a Cloudflare block page instead of our JSON.

`/mcp` is deliberately left out: the MCP transport keeps a long-lived connection
and its own request pattern, and it is not what a flood would target.

## Tests

No dependency, no wrangler, no login. From this directory:

```sh
node --test
```

The Worker only touches three globals (`fetch`, `caches`, and the `ctx` it is
handed), so `tests/index.test.mjs` stubs them and asserts the parts that are
hard to see by reading: the 503 shape and its CORS, the preflight during an
outage, HIT and MISS, that `/mcp` never touches the cache, that a JSON error
from the app is passed through, and that the header collapse and the edge secret
the origin depends on still behave exactly as before.

What this cannot cover is the runtime itself: that `caches.default` really
honours `Cache-Control`, and that a subrequest really throws when the origin is
unreachable. Those are verified with curl after a deploy.

## Coupled configuration

Three Space variables have to match this proxy. Getting any of them wrong
produces a failure that does not name its cause.

| Variable | Value | If wrong |
| --- | --- | --- |
| `OPENWIND_ALLOWED_HOSTS` | must list the public hostname **and** keep the `*.hf.space` one | `421 Invalid Host header` on `/mcp` |
| `OPENWIND_TRUSTED_PROXY_HOPS` | `2` | every user shares one rate-limit bucket, so 429s unrelated to real usage |
| `OPENWIND_EDGE_SECRET` | same value as this Worker's `EDGE_SHARED_SECRET` | the rate limiter can be bypassed, silently |

The `*.hf.space` hostname stays in `OPENWIND_ALLOWED_HOSTS` because that is the
Host the proxy presents upstream. Removing it cuts the proxy off.

### Why the shared secret exists

The Space stays reachable on its `*.hf.space` hostname, and that path skips
this proxy entirely. A caller taking it can send their own `X-Forwarded-For`;
with `OPENWIND_TRUSTED_PROXY_HOPS=2` the origin counts two from the right and
lands on the forged entry, so every request gets a fresh rate-limit bucket.
Measured working against production on 2026-08-01.

So the extra hop is not granted to a deployment, it is granted per request, to
traffic that proves it came through here. This Worker strips any inbound
`X-OhMyWind-Edge` and sets its own from `EDGE_SHARED_SECRET`; the origin
compares it in constant time and treats everything else as direct, where the
rightmost entry is the one Hugging Face appended and cannot be forged.

Leaving `OPENWIND_EDGE_SECRET` unset breaks nothing: the origin falls back to
the deployment-wide hop count and warns at startup. A rate limiter is an
availability control, so it fails open on purpose. It does mean the bypass
above stays open until the secret is set on both sides.

### Setting or rotating the secret

```sh
openssl rand -hex 32                         # one value for all three places
npx wrangler secret put EDGE_SHARED_SECRET   # from this directory
```

Then on **both** Spaces: Settings -> Variables and secrets -> New secret,
`OPENWIND_EDGE_SECRET`, same value. Adding a secret restarts the Space.

**Deploy this Worker before the Space picks up the matching code.** The Space
redeploys itself on a push to `main` or `dev`; this Worker does not. Ship them
the other way round and proxied traffic arrives without attestation, gets
treated as direct, and every user behind the proxy keys on Cloudflare's egress
address: one shared bucket, 429s for everyone. The reverse order is harmless:
a Worker sending a header the origin does not yet read changes nothing.

Verify with the diagnostic route, which reports what the origin decided
without ever echoing an address:

```sh
# Direct, with and without a forged header: the bucket must NOT move
curl -s https://qdonnars-openwind-mcp.hf.space/api/v1/_client
curl -s https://qdonnars-openwind-mcp.hf.space/api/v1/_client -H 'X-Forwarded-For: 1.1.1.1'

# Through this proxy: via_edge true, hops_applied 2, same bucket as above
curl -s https://mcp.ohmywind.fr/api/v1/_client
```

The `bucket` value is a hash of the *network* the origin counts against, not
of the address: `/32` for an IPv4 caller, `/64` for an IPv6 one. Two devices on
one IPv6 prefix therefore report the same bucket and share one quota, which is
correct and deliberate (a handset rotates its address inside its prefix, so
counting addresses would count nothing). Nothing about the hop chain changed
with it: the origin still reads the same entry of `X-Forwarded-For` it always
did, and a direct caller still cannot buy an extra hop.

Note for anyone comparing against a reading taken before 2026-09: the hashes
changed once, when the key became the network. Two readings are comparable
only if both were taken on the same side of that change.

`TRUSTED_PROXY_HOPS` is 2 because the chain reaching the app is
`<client>, <cloudflare egress>`: Cloudflare adds one hop in front of Hugging
Face. The Worker overwrites `X-Forwarded-For` with `CF-Connecting-IP` so that
chain is exactly two entries whatever the caller sends, which is what makes the
count safe to hard-code.

## Order of operations when cutting over

1. Add the public hostname to `OPENWIND_ALLOWED_HOSTS` **before** any traffic
   reaches it.
2. Deploy the Worker and attach the routes.
3. Verify `mcp-dev.ohmywind.fr` answers an MCP `initialize`.
4. Only then set `OPENWIND_TRUSTED_PROXY_HOPS=2` on both Spaces.
5. Point `VITE_API_BASE` at the public hostnames in Cloudflare Pages and
   redeploy. It is a build-time variable, so it needs a new build.

## Not handled here

Cold starts. A free Space sleeps after 48 h of inactivity, and the first request
after a long quiet spell wakes a cold container. The proxy makes that failure
readable (a `503` with `Retry-After`) but it cannot make it fast. The keep-alive
above is the fix, and it is off by decision, not by omission.
