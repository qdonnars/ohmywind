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

Free Spaces sleep after 48 h of inactivity, so a first request after a long
quiet spell wakes a cold container. The proxy cannot help with that; a scheduled
ping keeps the Space warm instead.
