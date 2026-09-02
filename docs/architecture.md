# OhMyWind — Architecture

## Mental model

OhMyWind is **not a router**. It is a thin set of MCP tools the LLM orchestrates
to plan a sailing passage. The intelligence — picking waypoints, choosing a
weather window, judging "is this a good day to go?" — lives in the LLM, not
on the server.

```
        ┌──────────────────────────────────────────────┐
        │  MCP client (Claude Desktop, Goose, …)       │
        │  • understands the human's intent            │
        │  • turns "Marseille → Porquerolles tomorrow" │
        │    into structured tool calls                │
        │  • renders qualitative judgment              │
        └────────────┬─────────────────────────────────┘
                     │ MCP (stdio | SSE)
        ┌────────────▼─────────────────────────────────┐
        │  openwind-mcp-core   (FastMCP, cloud-agnostic)│
        │   ┌── list_boat_archetypes                    │
        │   ├── get_marine_forecast                     │
        │   ├── plan_passage    (single + compare-      │
        │   │                    windows mode; declares │
        │   │                    MCP Apps UI resource)  │
        │   └── read_me                                 │
        │                                               │
        │   All four are read-only. Nothing on the      │
        │   public surface writes.                      │
        └────────────┬─────────────────────────────────┘
                     │  mounted at "/" by a deployment
        ┌────────────▼─────────────────────────────────┐
        │  openwind-api        (Starlette, no mcp dep) │
        │   create_app(settings, mcp_app=None)         │
        │   ┌── GET  /api/v1/archetypes                │
        │   ├── POST /api/v1/passage  (single + sweep) │
        │   ├── POST /api/v1/passage-by-eta            │
        │   ├── GET  /api/v1/marine/marc[/coverage]    │
        │   └── the landing page                       │
        │                                               │
        │   The same engine, over HTTP, for the web     │
        │   app. Serves with or without an MCP server   │
        │   behind it.                                  │
        └────────────┬─────────────────────────────────┘
                     │ pure Python calls
        ┌────────────▼─────────────────────────────────┐
        │  openwind-data       (no network framework)  │
        │   • adapters/openmeteo.py   (httpx, keyless) │
        │   • routing/geometry.py     (haversine, …)   │
        │   • routing/archetypes.py   (7 polars JSON)  │
        │   • routing/passage.py      (timing + derate)│
        │   • routing/complexity.py   (1-5 score)      │
        └────────────┬─────────────────────────────────┘
                     │ HTTPS
              ┌──────▼──────┐    ┌─────────────────┐
              │ Open-Meteo  │    │ (V2: MétéoFrance│
              │ Forecast +  │    │  BMS bulletins) │
              │ Marine APIs │    │                 │
              └─────────────┘    └─────────────────┘
```

## Orchestration pattern

A typical Claude Desktop conversation produces this tool sequence:

1. **Disambiguate the boat.** Claude calls `list_boat_archetypes()`, then maps
   the user's commercial model ("Sun Odyssey 32") to one of the 5 archetypes
   *from the descriptive metadata*. There is no server-side mapping table.
2. **Sample the forecast.** `get_marine_forecast(lat, lon, start, end)` for the
   route's midpoint(s) and the candidate window. AROME is the default model
   for the Mediterranean. Claude reads wind, gusts, and (when relevant) Hs.
3. **Plan the passage.** `plan_passage(waypoints, departure, archetype)`
   returns, in a single call: per-segment timing (TWA, polar speed,
   warnings), a 1-5 complexity score, and an `ohmywind.fr/plan?...`
   deep-link. The server fetches one wind bundle per segment (single-pass
   approximation; no convergence loop). When the caller passes
   `latest_departure`, the same call sweeps hourly windows over the route
   and returns a list — the LLM compares qualitatively.
4. **Render & narrate.** The tool declares
   `_meta.ui.resourceUri = ui://openwind/plan-passage`, so MCP-Apps-aware
   hosts (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman,
   MCPJam) auto-render the live ohmywind.fr/plan view in a sandboxed
   iframe. Hosts without MCP Apps support fall back to a text summary
   (ETA / complexity / warnings) plus the `openwind_url` deep-link. If the
   user later asks "how is this computed?", the LLM calls `read_me` and
   quotes the methodology.

The server **never decides** the trip is good or bad. It returns numbers; the
LLM produces the verdict.

## Cloud-agnostic split (non-negotiable)

| Package           | Imports allowed                          | Imports forbidden     |
| ----------------- | ---------------------------------------- | --------------------- |
| `openwind-data`   | `httpx`, stdlib                          | `mcp`, `gradio`, HF   |
| `openwind-api`    | `starlette`, `uvicorn`, `httpx`, `openwind-data` | `mcp`, `gradio`, HF |
| `openwind-mcp-core` | `mcp[cli]`, `openwind-data`            | `openwind-api`, `gradio`, HF |
| `hf-space/`       | `openwind-api`, `openwind-mcp-core`, `uvicorn`, `huggingface_hub` | —  |

`openwind-api` carries no MCP dependency, and a test asserts it: the package
imports and serves with the name `mcp` blocked. That is what makes the MCP
surface freezable without touching the API, and the API redeployable without
carrying the MCP SDK. The two meet only in a deployment, which hands the
mounted MCP app to `create_app`.

The wrapper does **not** use Gradio: it is a plain Starlette app served by
uvicorn in a Docker Space. `huggingface_hub` appears only there, to pull the
tidal atlas at build time.

`build_server()` in `openwind_mcp_core.server` is the single factory used by:

- the local stdio runner (`packages/mcp-core/scripts/run_local.py`)
- the HF Spaces wrapper (`packages/hf-space/app.py`)
- any future deployment (Fly.io, Modal, self-host)

`create_app()` in `openwind_api.app` is its REST counterpart. Re-deploying
anywhere is a ~100-line entry point that reads the environment, calls both,
and runs uvicorn; `packages/hf-space/app.py` is exactly that file.

The two shells serialise a passage through the same functions
(`openwind_data.views`), so a plan read in the web app and the same plan read
through an assistant are the same document. Goldens in `packages/api/tests`
and `packages/mcp-core/tests` compare bytes on both sides.

## Data conventions

- **Units**: knots (TWS, gusts, boat speed), degrees (TWD, bearing, TWA),
  meters (Hs), nautical miles (distance), hours (duration). Never km/h, never
  m/s in tool surfaces.
- **Time**: ISO-8601, timezone-aware. Naive datetimes are rejected at the
  passage boundary.
- **Direction**: TWD = direction the wind blows *from*. TWA in `[0, 180]`,
  symmetric (port = starboard for polar lookup).
- **Mediterranean V1 simplifications**: tides ignored (< 40 cm), permanent
  currents ignored (Liguro-Provençal), magnetic deviation ignored (true
  bearings throughout).

## Failure modes by design

- **Single-pass timing.** `plan_passage` does not iterate to convergence.
  Bias is bounded for typical Med passages (< few hours of forecast offset is
  inside the temporal correlation length).
- **Efficiency 0.75.** ORC polars are theoretical maxima; cruisers lose ~25%
  to trim, comfort, helm, and mean sea state. Override per-call if needed.
- **Wave derate off by default.** `use_wave_correction=False` keeps V1 timings
  stable. Flip on when sea data is in the bundle. See data-adapters
  `README.md` "References" for the formula sources.
- **No mapping table.** Sun Odyssey 32 → cruiser_30ft is *the LLM's job*,
  using the `examples` and `length_ft` fields from `list_boat_archetypes`.

## What this is not

- Not a competitor to Predict Wind / qtVlm — no isochrone routing, no GRIB
  optimization, no tide planning.
- Not a scoring engine — no `find_best_window()`, no numerical comparison
  across days. The LLM compares; we provide ingredients.
- Not a chat UI — the web app at `ohmywind.fr` is read-only, populated from a
  pre-computed `/plan?...` URL. Conversation happens in the MCP client.
