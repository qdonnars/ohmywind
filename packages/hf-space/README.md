---
title: OhMyWind MCP
emoji: ⛵
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: agpl-3.0
short_description: Sailing passage planner for any coast, via MCP.
---

# OhMyWind MCP ⛵

> **Talk to your LLM. Cast off with confidence.**
>
> Turns any MCP-capable assistant into a sailing planner, anywhere in the
> world. Extra precision on the French Atlantic coast, where SHOM and MARC
> tidal atlases replace the global model. Free, keyless, open source.

![OhMyWind passage plan rendered in the web app](https://raw.githubusercontent.com/qdonnars/ohmywind/main/docs/screenshots/plan.png)

---

## Try it in 30 seconds

**1.** In your MCP client, add the endpoint:

```
https://mcp.ohmywind.fr/mcp
```

**2.** Ask, in your own words:

> *"I'm leaving Marseille tomorrow morning for Porquerolles on a Sun Odyssey
> 36. How long is the passage and how tricky is it?"*

**3.** Your assistant calls the OhMyWind tools and answers in plain language.
On hosts that support the [MCP Apps spec](https://modelcontextprotocol.io/extensions/client-matrix)
(Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam) you
also get the live [ohmywind.fr](https://ohmywind.fr) plan view rendered
inline. On hosts that don't (Cursor, Le Chat, terminal), the assistant hands
you the same plan as a deep-link instead. No account. No API key. No credit
card.

> **First time with MCP?** Pick your client on
> [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients),
> then follow the
> [remote-server quickstart](https://modelcontextprotocol.io/docs/develop/connect-remote-servers).
> Works with Claude Desktop, Le Chat, Cursor, Goose, Zed, Continue, and any
> other MCP-compatible host. In Le Chat, add it under **Connectors → Add
> connector → Custom MCP connector** and paste the endpoint above.

### If your client only speaks stdio

Bridge it with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "ohmywind": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.ohmywind.fr/mcp"]
    }
  }
}
```

Nothing else to configure: **no account, no API key, no OAuth.** A client that
asks you for credentials is guessing rather than reading the server.

## Why OhMyWind

- **Free and keyless.** Wind + sea data via [Open-Meteo](https://open-meteo.com) (CC BY 4.0).
- **Mediterranean-tuned.** AROME 1.3 km by default, catches thermals and mistral. ICON-EU → ECMWF → GFS for longer reach.
- **Boat-aware.** 7 archetypes from 20 to 50 ft, real polars, an `efficiency` parameter for trim and crew level.
- **Window-aware.** One call sweeps up to 14 days of hourly departures so the LLM can pick the calmest slot.
- **Client-agnostic.** One HTTP MCP endpoint, no vendor lock-in. Rich [MCP Apps](https://modelcontextprotocol.io/extensions/client-matrix) widget on supporting hosts; clean deep-link fallback on the rest.
- **Open source, AGPL.** Self-host on Fly, Modal, or your own VPS in minutes, under your own name and icons.

## Four tools

| Tool                      | What it does                                                              |
|---------------------------|---------------------------------------------------------------------------|
| `list_boat_archetypes`    | Seven descriptive archetypes; the LLM maps "Sun Odyssey 36" → `cruiser_30ft`. |
| `get_marine_forecast`     | Wind + sea around a point/window, multi-model.                            |
| `plan_passage`            | End-to-end: per-leg timing + 1–5 complexity + ohmywind.fr deep-link, in one call. Pass `latest_departure` and it walks every hourly window up to 14 days out so the LLM can compare side-by-side. Declares an MCP Apps UI resource; supporting hosts auto-render the live plan in a sandboxed iframe. |
| `read_me`                 | Returns OhMyWind's calculation methodology. Call it when the user asks how things are computed. |

## REST API

The web app talks to the same deployment over plain HTTP. Every response is
JSON, no key and no account required.

| Route | Method | Notes |
|---|---|---|
| `/api/v1/archetypes` | GET | The seven boat archetypes. `Cache-Control: public, max-age=86400`. |
| `/api/v1/passage` | POST | Passage plan from a departure time. Sweeps departures when `latest_departure` is set. |
| `/api/v1/passage-by-eta` | POST | Passage plan from a target arrival. |
| `/api/v1/marine/marc` | GET | SHOM and MARC tidal atlas overlay for one point. Always 200, `covered` tells you whether there was anything to give. |
| `/api/v1/_client` | GET | How this deployment sees the caller, for rate-limit diagnosis. |
| `/mcp` | POST | The MCP endpoint. Streaming transport, never compressed. |

Responses under `/api/v1` are gzipped when the client asks for it and the body
exceeds 1 KB. `/mcp` is deliberately excluded.

### Limits

A single free CPU worker serves everything, MCP sessions included, so each
route carries a ceiling. All of them are configurable by environment variable
on the deployment.

| Limit | Default | Environment variable |
|---|---|---|
| Requests per IP per minute on the POST planners | 30 | `OPENWIND_RATE_LIMIT_REQUESTS` |
| Requests per IP per minute on `/api/v1/marine/marc` | 120 | `OPENWIND_MARC_RATE_LIMIT` |
| Rate-limit window | 60 s | `OPENWIND_RATE_LIMIT_WINDOW_S` |
| Request body on `/api/v1/*` | 4 MiB, `413` beyond | `OPENWIND_MAX_BODY_BYTES` |
| `forecast_cache` corridor points | 120, `422` beyond | fixed in `openwind-data` |
| `forecast_cache` time axis | 400 hours, `422` beyond | fixed in `openwind-data` |
| Steps per `/api/v1/marine/marc` call | 800, `422` beyond | fixed in the wrapper |

The overlay endpoint has its own, wider bucket because the web app calls it
once per corridor point, up to 60 times for one computation. Its step ceiling
allows 30 days of hourly predictions (721 steps) and refuses the shapes that
would block the worker for seconds, such as a month at a 5-minute step.

## About this Space

> ⚠️ This Space uses the **Docker SDK** (not Gradio). It does **not** carry
> the HF MCP badge and isn't listed in
> `huggingface.co/spaces?filter=mcp-server`. Discoverability lives at
> [ohmywind.fr](https://ohmywind.fr) instead.

**Source of truth:** <https://github.com/qdonnars/ohmywind>. This Space is
auto-deployed by GitHub Actions from `packages/hf-space/` on `main`. Don't
commit directly to the Space repo; your changes will be overwritten at the
next push.

The wrapper carries the HTTP surface (landing page, REST endpoints, CORS,
rate limiting) and nothing else. All domain logic lives in `openwind-mcp-core`
and `openwind-data` upstream, re-deployable on Fly, Modal, or a VPS by writing
a different wrapper. Neither upstream package imports Gradio or
`huggingface_hub`.

## Cold-start

Free CPU-basic hardware sleeps after 48 h of inactivity. First request after
sleep takes ~5 s to wake. Acceptable for V1.

## License and trademark

Code: AGPL-3.0-or-later. Forking and self-hosting stay free; a modified
instance served over the network must publish its source. The name "OhMyWind"
is filed as a trademark at the INPI, and the visual identity (logo, icons)
stays under copyright. Neither is covered by the AGPL licence, so a fork ships
under its own name and icons. Full policy:
[TRADEMARK.md](https://github.com/qdonnars/ohmywind/blob/main/TRADEMARK.md).
