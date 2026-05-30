# OpenWind — Working Notes

## Mission

Open-source sailing planner for the French coastline (Atlantic + Mediterranean), powered by an MCP server and a public web app.
The user describes their trip in natural language to an MCP client (e.g. Claude Desktop, or any other).
The client orchestrates marine data fetches, estimates passage time and complexity via MCP tools,
and renders a precomputed plan in the standalone web app.

Primary scope: French Atlantic coast (Manche + Atlantique) and Mediterranean. Both regions are first-class.

The web app is **strictly standalone** — it never proposes "talk to an assistant". Conversational entry happens client-side.

## Architecture (cible)

- `packages/web/` — React 19 + TypeScript + Vite, deployed to GitHub Pages on **openwind.fr**
- `packages/data-adapters/` — Python lib, pure domain logic (marine data adapters, polars, routing, complexity)
- `packages/mcp-core/` — Python lib, FastMCP server definition (cloud-agnostic, redeployable anywhere)
- `packages/hf-space/` — Thin Gradio wrapper for Hugging Face Spaces deployment, served at **mcp.openwind.fr**

Plan d'exécution détaillé : `plan/` (local, non-tracké).

## Cloud-agnostic principle (non-négociable)

The MCP server core (`mcp-core`) MUST stay deployment-agnostic.
The `hf-space/` package is a thin wrapper for HF Spaces.
We could re-deploy on Fly.io, Modal, or self-hosted by writing a different wrapper without touching `mcp-core` or `data-adapters`.

→ Concrètement : aucun import de `gradio` ou de `huggingface_hub` dans `mcp-core` ou `data-adapters`. Si tu en vois un, c'est un bug.

## Domain knowledge — Sailing

- Wind speeds always in **knots**, never km/h
- Wind directions in TWD/TWA/AWA/AWS conventions, document explicitly when used
- True heading vs magnetic heading — V1 uses true throughout
- **AROME** is the default high-resolution model (1.3 km, covers Atlantic French coast + Mediterranean, captures thermal and local winds). When `models` not specified, return AROME first / use AROME for passage estimation.
- Tides and currents: surfaced from Open-Meteo Marine (SMOC, 8 km global) and reported only when materially relevant per leg (currents ≥ 0.3 kt, tidal range ≥ 0.5 m). High-precision MARC atlases (250 m) for critical Atlantic passes are a later enhancement.
- Mediterranean specifics:
  - Tides typically < 40 cm and currents typically < 0.3 kt → most legs will not surface tide/current data, by design
  - Local wind names: mistral (NW), tramontane (NW), sirocco (SE), marin (SE-S), levante (E), libeccio (SW)
- Atlantic specifics:
  - Tidal range can exceed 10 m (Manche), tidal currents > 5 kt in narrow passes (Goulet de Brest, Raz de Sein, Raz Blanchard) — tide and current data are first-class
  - Open-Meteo SMOC at 8 km is sufficient for open-water planning but **insufficient for narrow passes** — flag this in user-facing copy

## Data sources of record

- **Open-Meteo Forecast API** — wind, multi-model (AROME, ICON, GFS, ECMWF), keyless
- **Open-Meteo Marine API** — wave height, period, direction, wind wave vs swell, keyless
- (V2 candidates) Météo-France API for official BMS bulletins

## Conventions

- Python: ruff for lint + format, pytest for tests, uv for env management
- TypeScript: ESLint flat config (existing)
- Commits: **conventional commits** (`feat:`, `fix:`, `refacto:`, `docs:`, `chore:`, `test:`)
- All adapters implement `MarineDataAdapter` Protocol from `adapters/base.py`
- Async everywhere (httpx, asyncio.gather)

## Failure modes — things to avoid

- ❌ Don't add heavy backend deps to `packages/web/` — must stay GH Pages-deployable
- ❌ Don't ship API keys in the bundle (Open-Meteo is keyless, keep it that way)
- ❌ Don't break `main` branch deployment during refactos — work on branches
- ❌ Don't replace LLM qualitative judgment with numerical scoring (no `find_best_window` in V1)
- ❌ Don't try to compete with real routing tools (Predict Wind, qtVlm) on optimization
- ❌ Don't couple `mcp-core` to Gradio or HF Spaces — those belong only in `hf-space/`
- ❌ Don't make the web app propose to chat with an assistant — it stays standalone
- ❌ Don't réintroduire les zones d'accélération côtière (retiré V1)
- ❌ Don't shipper de mapping "Sun Odyssey 32 → cruiser_30ft" en dur côté serveur — le LLM décide à partir des descriptions de `list_boat_archetypes()`

## Workflow

- Local `plan/` files (gitignored) are the source of truth for scope and decisions
- Tests must pass before commit
