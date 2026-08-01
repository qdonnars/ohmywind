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

Two Space variables have to match this proxy. Getting either wrong produces a
failure that does not name its cause.

| Variable | Value | If wrong |
| --- | --- | --- |
| `OPENWIND_ALLOWED_HOSTS` | must list the public hostname **and** keep the `*.hf.space` one | `421 Invalid Host header` on `/mcp` |
| `OPENWIND_TRUSTED_PROXY_HOPS` | `2` | every user shares one rate-limit bucket, so 429s unrelated to real usage |

The `*.hf.space` hostname stays in `OPENWIND_ALLOWED_HOSTS` because that is the
Host the proxy presents upstream. Removing it cuts the proxy off.

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
