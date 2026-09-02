# openwind-api

The OhMyWind REST API as a library: a Starlette application, and nothing about
where it runs.

```python
from openwind_api import Services, Settings, create_app

app = create_app(Settings.from_env())  # REST only
app = create_app(settings, mcp_app=mounted_mcp)  # REST + an MCP server at "/"

# A deployment that serves both hands the same objects to both shells, so one
# process holds one HTTP connection pool, one forecast cache and one copy of
# the tidal atlases.
services = Services.from_settings(settings)
app = create_app(settings, mcp_app=build_mcp(services.marine), services=services)
```

## Why it is its own package

The API and the MCP server answer the same questions to two different
audiences, and they used to be one file in a Hugging Face wrapper. That made
the API impossible to redeploy without carrying the MCP SDK, and the MCP
surface impossible to freeze without touching the API.

Now `mcp_app` is optional, this package declares no `mcp` dependency, and a
test asserts it by importing the package with the name `mcp` blocked.

## Surface

| Route | What it does |
| --- | --- |
| `GET /api/v1/archetypes` | the seven boat archetypes, cached a day |
| `POST /api/v1/passage` | plan one departure, or sweep a range of them |
| `POST /api/v1/passage-by-eta` | pin the arrival, solve for the departure |
| `GET /api/v1/marine/marc` | tidal atlas overlay for one point |
| `POST /api/v1/marine/marc/batch` | the same overlay for a whole corridor, in one call |
| `GET /api/v1/marine/marc/coverage` | where it is worth asking at all |
| `GET /api/v1/_client` | how the deployment sees the caller (rate-limit diagnosis) |
| `GET /` | the landing page |

## Layout

- `app.py`: `create_app`, the middleware stack, the lifespan.
- `routes/`: one module per resource. Handlers stay thin.
- `parsing.py`: reading an untrusted request, once for both passage routes.
- `errors.py`: one mapping from exception to `(status, message, code)`.
- `services.py`: the tidal atlases and the marine adapter, built once, on
  `app.state.services`. A request with no `forecast_cache` is planned through
  that adapter, so a live REST plan reads the same currents as the MCP tools.
- `security.py`: rate limiting, body ceiling, security headers, client IP.
  The limiter counts per network, `/32` for IPv4 and `/64` for IPv6, because a
  phone picks its own address inside the prefix its carrier assigned.
- `access.py`: one logfmt line per request, and the `X-Request-Id` header.
- `static/landing.html`: the landing page. Its media ship with the deployment.

Serialising a passage is not here: that is `openwind_data.views`, shared with
the MCP shell so the two describe the same sailing.

## The overlay, one point or a corridor

`GET /api/v1/marine/marc` answers for one point. `POST /api/v1/marine/marc/batch`
answers for many, from the same function, so an overlay in the batch is byte
for byte the GET's body for that point:

```json
{"points": [[lat, lon], ...], "start": "<ISO>", "end": "<ISO>", "step_minutes": 60}
```

`{"overlays": [...]}`, one object per point, **in the order the points were
sent** (a client zips them back by index), `covered: false` entries included.
Not cached: a POST body is not a cache key any intermediary honours, and the
GET is still there for clients that want the day-long cache. One rate-limit
token per call, whatever the point count.

The window rules are the GET's, applied once. Three ceilings bound a call, and
they are checked in this order:

| Ceiling | Default | `code` |
| --- | --- | --- |
| points | 120 | `too_many_points` |
| steps, i.e. instants in the window | 800 | `too_many_steps` |
| points x steps | 24 000 (`OPENWIND_MARC_BATCH_MAX_CELLS`) | `batch_too_large` |

The third exists because the first two do not bound the product: 120 points
over 30 days hourly is 86 520 point-steps and 5.2 s of prediction, measured on
the real atlases, on a bucket that allows 120 requests a minute per IP. The
web app's own call is 21 points over 7 days hourly, 3549 point-steps, seven
times inside the cap. The work runs off the event loop either way.

## Compressed request bodies

`POST /api/v1/*` accepts `Content-Encoding: gzip` (and `deflate`, in both the
zlib and the raw shapes the name is used for). The web client's biggest
legitimate body is 48 KB of `forecast_cache` that gzips to 1.5 KB, which on a
marina 4G link is the difference between a plan that starts now and one that
starts in a second.

The 4 MiB body ceiling applies to the **decompressed** bytes, and it is
enforced as they are produced rather than after the fact: `zlib` is never
asked for more than what is left of the budget, so a body that expands past
the ceiling is refused with the usual 413 `body_too_large` having allocated a
few kilobytes. A compressed body is also still bounded on the wire by the same
ceiling, by the middleware outside this one.

| Situation | Status | `code` |
| --- | --- | --- |
| decompressed body over the ceiling | 413 | `body_too_large` |
| `Content-Encoding` we do not implement (`br`, `zstd`, a list) | 415 | `unsupported_encoding` |
| body that does not decode as it claims to | 422 | `invalid_body_encoding` |

`/mcp` is untouched: it is outside the `/api/v1` prefix and frames its own
bodies.

Hugging Face's edge passes request bodies through untouched, headers included,
so a gzipped POST reaches the container as it was sent. Nothing at the edge
decompresses it on our behalf, and nothing there rejects the header. The
Cloudflare Worker in `packages/edge-proxy` forwards the body unchanged too.
Verify on the dev Space after a deploy with the plain and the gzipped body
side by side: the two responses must be identical.

## Logs

One line per request on the `openwind_api.access` logger, at INFO, in logfmt:

```
id=9f2c1a4b7e3d5088 method=POST path=/api/v1/passage status=200 dur_ms=263.4 bytes=4267 cache=yes bucket=846488f1
```

`cache` says whether the caller posted a `forecast_cache`, which is the
difference between a request that cost an upstream fan-out and one that cost
only CPU. `bucket` is `sha256(client address)[:8]`: enough to tell whether one
caller is responsible for a burst, and not an address. **No address is ever
logged**, in any field, in any shape, and a test greps the whole log to keep
it that way.

`enc` is appended only when the request declared a `Content-Encoding`, so a
plain request logs the line it always logged.

`X-Request-Id` is echoed when the caller sends a usable one (64 chars of
`[A-Za-z0-9._:-]`) and generated otherwise, returned on every response and
exposed through CORS so the web app can quote it.

Every upstream Open-Meteo call is logged at DEBUG, by host, with its status,
its duration and whether the cache answered instead. Never with the query
string: it carries the waypoints.

## Errors

Every error body carries `error` (unchanged, human-readable) and `code`
(stable, for branching). The table of codes is the module docstring of
`errors.py`. A caller that does not recognise a code falls back on the status.

## Tests

```bash
uv sync --extra dev && uv run pytest
```

The goldens under `tests/goldens/` compare responses byte for byte. Change one
deliberately with `OPENWIND_REGENERATE_GOLDENS=1 uv run pytest`, and show the
diff in the pull request: a golden that moves without being mentioned is a
contract change nobody agreed to.
