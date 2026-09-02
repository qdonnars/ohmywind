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
