# openwind-api

The OhMyWind REST API as a library: a Starlette application, and nothing about
where it runs.

```python
from openwind_api import Settings, create_app

app = create_app(Settings.from_env())  # REST only
app = create_app(settings, mcp_app=mounted_mcp)  # REST + an MCP server at "/"
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
- `services.py`: the tidal atlases, loaded once, on `app.state.services`.
- `security.py`: rate limiting, body ceiling, security headers, client IP.
- `static/landing.html`: the landing page. Its media ship with the deployment.

Serialising a passage is not here: that is `openwind_data.views`, shared with
the MCP shell so the two describe the same sailing.

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
