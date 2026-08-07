"""HF Space entry point — serves the OhMyWind FastMCP server over HTTP.

This wrapper is intentionally thin. All tools live in ``openwind_mcp_core``
(which itself imports ``openwind_data``). Re-deploying on Fly/Modal/VPS = a
different Dockerfile that runs the same ``build_server()`` factory.

Transport: ``streamable-http`` on port 7860 (HF Spaces default). Clients
connect to ``https://qdonnars-openwind-mcp.hf.space``. A custom domain on the
Space is deferred: HF gates those behind a PRO subscription.

Trade-off explicitly accepted: HF Docker SDK Spaces do not get the ``MCP``
badge or the one-click connector flow that Gradio ``mcp_server=True`` Spaces
get. Discoverability is via the project website, not via the HF catalog.
Re-evaluate if traffic plateaus.
"""

from __future__ import annotations

import dataclasses
import logging
import math
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import uvicorn
from mcp.server.transport_security import TransportSecuritySettings
from openwind_data.adapters.base import ForecastHorizonError, UpstreamRateLimitError
from openwind_data.adapters.cache_backed import CacheBackedAdapter
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry
from openwind_data.routing.archetypes import BoatPolar, list_archetypes_metadata
from openwind_data.routing.complexity import score_complexity
from openwind_data.routing.geometry import Point, validate_point, validate_waypoints
from openwind_data.routing.passage import (
    NoModelCoveredError,
    build_conditions_summary,
    estimate_passage,
    estimate_passage_for_arrival,
    estimate_passage_windows,
)
from openwind_mcp_core import build_server
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Mount, Route

from security import (
    ALLOWED_ORIGINS,
    TRUSTED_PROXY_HOPS,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    bucket_id,
    came_through_edge,
    forwarded_hop_count,
    trusted_hops_for,
    warn_if_edge_secret_missing,
)

_logger = logging.getLogger(__name__)

PORT = 7860

# FastMCP's streamable-http transport ships DNS-rebinding protection that
# rejects any Host header outside ``localhost`` by default — on HF that
# manifests as 421 "Invalid Host header" with the Space hostname. The Space
# is fronted by HF's TLS proxy which we already authorize via
# ``proxy_headers``, so we extend the allowed-hosts list to include the
# Space hostname (overridable via env for future custom domains / migrations).
DEFAULT_ALLOWED_HOSTS = [
    # The Host the Worker presents upstream, and the public one a direct
    # caller sends. Both must pass or one of the two paths 421s.
    "qdonnars-openwind-mcp.hf.space",
    "mcp.ohmywind.fr",
]
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("OPENWIND_ALLOWED_HOSTS", ",".join(DEFAULT_ALLOWED_HOSTS)).split(",")
    if h.strip()
]


LANDING_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OhMyWind MCP : talk to your LLM, cast off with confidence</title>
  <link rel="icon" type="image/svg+xml" href="https://ohmywind.fr/favicon.svg">
  <link rel="icon" type="image/png" sizes="192x192" href="https://ohmywind.fr/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="https://ohmywind.fr/icon-512.png">
  <link rel="apple-touch-icon" href="https://ohmywind.fr/icon-192.png">
  <meta name="description" content="OhMyWind MCP. Free, keyless sailing passage planner for any coast, with high-precision tides on the French Atlantic.">
  <meta property="og:title" content="OhMyWind MCP">
  <meta property="og:description" content="Talk to your LLM. Cast off with confidence. Free, keyless sailing planner via MCP.">
  <meta property="og:image" content="https://ohmywind.fr/icon-512.png">
  <meta property="og:url" content="https://ohmywind.fr">
  <meta name="twitter:card" content="summary">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #FAF7EE;
      --card: #FFFFFF;
      --text: #1A1A1A;
      --muted: #4A4A4A;
      --faint: #777169;
      --border: #E2DDCD;
      --accent: #1D9E75;
      --soft: #F1ECDF;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #15140F;
        --card: rgba(255,255,255,0.04);
        --text: #F2F2F2;
        --muted: #B8B5AC;
        --faint: #888780;
        --border: rgba(255,255,255,0.10);
        --accent: #2BBE93;
        --soft: rgba(255,255,255,0.06);
      }
    }
    * { box-sizing: border-box; }
    body {
      font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      max-width: 44rem; margin: 0 auto; padding: 3rem 1.25rem 4rem;
      background: var(--bg); color: var(--text);
    }
    h1 { font-size: 2rem; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
    .lede { font-size: 1.15rem; color: var(--muted); margin: 0 0 2rem; line-height: 1.45; }
    h2 { font-size: 1.15rem; margin: 2.25rem 0 0.75rem; letter-spacing: -0.005em; }
    p { margin: 0.6rem 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { font-size: 0.92em; background: var(--soft); padding: 0.1rem 0.35rem; border-radius: 4px; }
    pre { background: var(--card); border: 1px solid var(--border); padding: 0.85rem 1rem;
          border-radius: 10px; overflow-x: auto; margin: 0.75rem 0; }
    pre code { background: none; padding: 0; font-size: 0.95em; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hero {
      display: block; width: 100%; max-width: 100%; height: auto;
      border-radius: 12px; border: 1px solid var(--border);
      margin: 1rem 0 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .badge {
      display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px;
      background: var(--soft); color: var(--accent); font-size: 0.75rem;
      font-weight: 600; letter-spacing: 0.04em; vertical-align: middle;
      text-transform: uppercase;
    }
    blockquote {
      margin: 0.75rem 0; padding: 0.75rem 1rem; border-left: 3px solid var(--accent);
      background: var(--soft); border-radius: 0 8px 8px 0; color: var(--muted);
      font-style: italic;
    }
    ol { padding-left: 1.25rem; line-height: 1.7; }
    ol li { margin: 0.4rem 0; }
    .perks { display: grid; grid-template-columns: 1fr; gap: 0.5rem; margin: 1rem 0; padding: 0; list-style: none; }
    .perks li { padding: 0.65rem 0.9rem; background: var(--card); border: 1px solid var(--border);
                border-radius: 8px; font-size: 0.95rem; }
    .perks strong { color: var(--text); }
    details.connector {
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      margin: 0.6rem 0; overflow: hidden;
    }
    details.connector summary {
      cursor: pointer; padding: 0.85rem 1rem; font-weight: 600; list-style: none;
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
    }
    details.connector summary::-webkit-details-marker { display: none; }
    details.connector summary::after {
      content: "›"; color: var(--faint); font-size: 1.4rem; line-height: 1;
      transition: transform 0.15s ease; transform-origin: center;
    }
    details.connector[open] summary::after { transform: rotate(90deg); }
    details.connector[open] summary { border-bottom: 1px solid var(--border); }
    details.connector ol { padding: 0.85rem 1rem 1rem 2.25rem; margin: 0; }
    details.connector ol li { margin: 0.45rem 0; }
    details.connector pre { margin: 0.5rem 0; }
    .footnote { color: var(--faint); font-size: 0.85rem; margin-top: 2.5rem; }
  </style>
</head>
<body>
  <h1>OhMyWind MCP <span class="badge">running</span></h1>
  <p class="lede">Talk to your LLM. Cast off with confidence.<br>
    A free, keyless, open-source sailing planner for any coast, with
    high-precision tidal currents on the French Atlantic. Exposed as an MCP
    server so any compatible assistant can use it.</p>

  <img class="hero" src="https://raw.githubusercontent.com/qdonnars/ohmywind/main/docs/screenshots/plan.png"
       alt="OhMyWind passage plan: 5 waypoints, 48.6 nm, ETA 21:24, complexity 3 of 5.">

  <h2>Connect it to your assistant</h2>
  <p>Pick yours below (under a minute, no install, no API key).</p>

  <details class="connector">
    <summary>Claude (claude.ai)</summary>
    <ol>
      <li>Open <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">claude.ai → Settings → Connectors</a>.</li>
      <li>Scroll to the bottom and click <strong>Add custom connector</strong>.</li>
      <li>Set <strong>Name</strong>: <code>OhMyWind</code>.</li>
      <li>Paste this in <strong>Remote MCP server URL</strong>:
        <pre><code>https://mcp.ohmywind.fr/mcp</code></pre></li>
      <li>Click <strong>Add</strong>. In any new chat, OhMyWind shows up in the
        <strong>Search and tools</strong> menu: toggle it on.</li>
    </ol>
  </details>

  <details class="connector">
    <summary>Le Chat (Mistral)</summary>
    <ol>
      <li>Open <a href="https://chat.mistral.ai" target="_blank" rel="noopener">chat.mistral.ai</a> and sign in.</li>
      <li>In the left sidebar, open <strong>Intelligence</strong> &rarr;
        <strong>Connecteurs</strong> (in English:
        <strong>Intelligence</strong> &rarr; <strong>Connectors</strong>),
        then click <strong>Add MCP server</strong>.</li>
      <li>Set <strong>Name</strong>: <code>OhMyWind</code> &middot; <strong>Auth</strong>: <code>None</code>.</li>
      <li>Paste this in <strong>URL</strong>:
        <pre><code>https://mcp.ohmywind.fr/mcp</code></pre></li>
      <li>Save, then enable the OhMyWind toggle inside any conversation.</li>
      <li>Le Chat doesn&rsquo;t (yet) support the MCP Apps spec, so the
        widget won&rsquo;t render inline: the assistant will hand you
        an <a href="https://ohmywind.fr">ohmywind.fr</a> deep-link instead.</li>
    </ol>
  </details>

  <details class="connector">
    <summary>ChatGPT (OpenAI)</summary>
    <ol>
      <li>Requires ChatGPT <strong>Pro</strong>, Business, or Enterprise (custom connectors).</li>
      <li>Open <a href="https://chatgpt.com/#settings/Connectors" target="_blank" rel="noopener">ChatGPT → Settings → Connectors</a>.</li>
      <li>In <strong>Advanced</strong>, turn on <strong>Developer mode</strong>.</li>
      <li>Back in <strong>Connectors</strong>, click <strong>Create</strong>.</li>
      <li>Set <strong>Name</strong>: <code>OhMyWind</code> · <strong>Authentication</strong>: <code>No authentication</code>.</li>
      <li>Paste this in <strong>MCP server URL</strong>:
        <pre><code>https://mcp.ohmywind.fr/mcp</code></pre></li>
      <li>Trust the connector and save. Activate it in a chat via
        <strong>+ → Developer connectors → OhMyWind</strong>.</li>
    </ol>
  </details>

  <h2>Then ask, in your own words</h2>
  <blockquote>I'm leaving Marseille tomorrow morning for Porquerolles on a Sun Odyssey 36.
    How long is the passage and how tricky is it?</blockquote>
  <p>Your assistant calls the OhMyWind tools and answers in plain language.
    On hosts that support the
    <a href="https://modelcontextprotocol.io/extensions/client-matrix" target="_blank" rel="noopener">MCP Apps spec</a>
    (Claude, Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam),
    the live <a href="https://ohmywind.fr">ohmywind.fr</a> plan view also
    renders inline as a sandboxed iframe. On hosts that don&rsquo;t (Cursor,
    Le Chat, terminal), the assistant hands you the same plan as a deep-link
    instead.</p>
  <p>Or to compare a whole weekend&rsquo;s worth of departure windows in one
    shot:</p>
  <blockquote>Marseille &rarr; Porquerolles, same boat. Show me the
    calmest departure between Saturday morning and Monday evening.</blockquote>

  <h2>Why OhMyWind</h2>
  <ul class="perks">
    <li><strong>Free &amp; keyless.</strong> Wind + sea via
      <a href="https://open-meteo.com">Open-Meteo</a> (CC BY 4.0).</li>
    <li><strong>Mediterranean-tuned.</strong> AROME 1.3 km by default; ICON-EU &rarr; ECMWF &rarr; GFS for longer reach.</li>
    <li><strong>Boat-aware.</strong> Seven archetypes from 20 to 50 ft, real polars, an <code>efficiency</code> parameter for trim and crew level.</li>
    <li><strong>Window-aware.</strong> One call sweeps up to 14 days of hourly departures so the LLM can pick the calmest slot.</li>
    <li><strong>Client-agnostic.</strong> One HTTP MCP endpoint. No vendor lock-in.</li>
    <li><strong>Open source, MIT.</strong> Self-host on Fly, Modal, your VPS.</li>
  </ul>

  <h2>Four tools</h2>
  <p>The workhorse is <code>plan_passage</code>: one call returns timing, a
    1-5 complexity score, and an <a href="https://ohmywind.fr">ohmywind.fr</a>
    deep-link. It declares an MCP Apps UI resource, so supporting hosts also
    render the live plan view in a sandboxed iframe. Pass
    <code>latest_departure</code> and it walks every hourly window up to 14
    days out so the LLM can compare side-by-side. The other three tools
    (<code>list_boat_archetypes</code>,
    <code>get_marine_forecast</code>, <code>read_me</code>) let the
    assistant pick a boat, sample the forecast ad hoc, or explain the math
    behind a result.</p>
  <p>Don&rsquo;t want to wire an MCP host? You can also drive everything by
    hand at <a href="https://ohmywind.fr/plan">ohmywind.fr/plan</a>:
    click your route, pick a boat, slide the departure.</p>

  <h2>Source</h2>
  <p>Project site: <a href="https://ohmywind.fr">ohmywind.fr</a> &middot;
    GitHub: <a href="https://github.com/qdonnars/ohmywind">qdonnars/ohmywind</a>
    (MIT).</p>

  <p class="footnote">First request after inactivity may take a few seconds
    (HF Spaces cold-start).</p>
</body>
</html>
"""


def _to_json(obj: Any) -> Any:
    """Recursively convert dataclasses and datetimes to JSON-serializable types."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: _to_json(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, (tuple, list)):
        return [_to_json(v) for v in obj]
    return obj


# Maps the web client's user-facing model names (see packages/web/src/config/
# modelConfig.ts) to the Open-Meteo unified-API slugs that the data-adapter
# already exercises in AUTO_FALLBACK_CHAIN. V1 scope: only the four chain
# members translate. Other web models (ARPEGE_*, ICON_GLOBAL/_D2, UKMO_*, GEM,
# DMI, METNO, ECMWF_AIFS) stay in the web table for forecast display but are
# silently dropped here because their slugs haven't been validated end-to-end
# against passage timing. Always append gfs_seamless as ultimate fallback so
# an exotic top-of-chain pick never leaves the chain empty at far horizons.
_MODEL_NAME_MAP: dict[str, str] = {
    "AROME": "meteofrance_arome_france",
    "ICON": "icon_eu",
    "ECMWF": "ecmwf_ifs025",
    "GFS": "gfs_seamless",
}


def _translate_models(raw: Any) -> tuple[str, ...] | None:
    """Translate web model names to Open-Meteo slugs. Returns None when the
    caller didn't send a `models` field or the list is empty after filtering.
    Always appends gfs_seamless as last-resort fallback unless already present.
    """
    if not isinstance(raw, list):
        return None
    translated: list[str] = []
    for name in raw:
        if not isinstance(name, str):
            continue
        slug = _MODEL_NAME_MAP.get(name)
        if slug and slug not in translated:
            translated.append(slug)
    if not translated:
        return None
    if "gfs_seamless" not in translated:
        translated.append("gfs_seamless")
    return tuple(translated)


def _build_cache_adapter(raw: Any) -> CacheBackedAdapter | None:
    """Build a CacheBackedAdapter from the request's ``forecast_cache``, or None.

    When the web client has sampled the route corridor in the browser it posts
    a ``forecast_cache`` object; we read weather from it instead of calling
    Open-Meteo (distributes the upstream load off the single Space IP). When
    absent (every MCP client, and web clients that fell back), returns None so
    the planner uses the default live OpenMeteoAdapter — the MCP path in
    ``mcp-core`` never reaches this and is unaffected.

    Raises ``ValueError`` on a malformed payload so the caller returns 422.
    """
    if raw is None:
        return None
    return CacheBackedAdapter.from_payload(raw)


def _parse_polar(raw: Any) -> BoatPolar | None:
    """Build a BoatPolar from the web client's `polar` payload. Returns None
    when no payload is provided. Raises ValueError on shape mismatch / invalid
    values so the caller can surface a 422 with the original message.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("polar must be an object")
    try:
        tws = [float(v) for v in raw["tws_kn"]]
        twa = [float(v) for v in raw["twa_deg"]]
        matrix = [[float(v) for v in row] for row in raw["boat_speed_kn"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"polar fields missing or non-numeric: {exc}") from exc
    if len(tws) < 2 or len(twa) < 2:
        raise ValueError("polar must have >= 2 TWS and >= 2 TWA entries")
    from itertools import pairwise

    if any(a >= b for a, b in pairwise(tws)):
        raise ValueError("polar tws_kn must be strictly ascending")
    if any(a >= b for a, b in pairwise(twa)):
        raise ValueError("polar twa_deg must be strictly ascending")
    if twa[0] < 0 or twa[-1] > 180:
        raise ValueError("polar twa_deg must lie in [0, 180]")
    if len(matrix) != len(tws):
        raise ValueError(
            f"polar boat_speed_kn has {len(matrix)} rows, expected {len(tws)} (one per TWS)"
        )
    for i, row in enumerate(matrix):
        if len(row) != len(twa):
            raise ValueError(
                f"polar boat_speed_kn row {i} has {len(row)} cols, expected {len(twa)}"
            )
        for j, v in enumerate(row):
            if v < 0 or v > 30:
                raise ValueError(f"polar boat_speed_kn[{i}][{j}]={v} out of range [0, 30]")
    # Optional motor config. Both fields must be set together; either alone
    # is dropped silently so a half-filled web form never silently changes
    # the simulation (matches the frontend / backend "both or neither" rule).
    motor_threshold = _parse_optional_kn(raw.get("motor_threshold_kn"), max_kn=10.0)
    motor_speed = _parse_optional_kn(raw.get("motor_speed_kn"), max_kn=12.0)
    if motor_threshold is None or motor_speed is None:
        motor_threshold = None
        motor_speed = None
    return BoatPolar(
        name=str(raw.get("name", "custom")),
        length_ft=int(raw.get("length_ft", 0) or 0),
        type=str(raw.get("type", "monohull")),
        category=str(raw.get("category", "custom")),
        examples=tuple(str(e) for e in raw.get("examples", ())),
        performance_class=str(raw.get("performance_class", "custom")),
        tws_kn=tuple(tws),
        twa_deg=tuple(twa),
        boat_speed_kn=tuple(tuple(row) for row in matrix),
        motor_threshold_kn=motor_threshold,
        motor_speed_kn=motor_speed,
    )


def _parse_optional_kn(raw: Any, *, max_kn: float) -> float | None:
    """Coerce a numeric field to a positive bounded float, or None.

    Tolerant: any non-number, NaN, ``<= 0``, or ``> max_kn`` becomes None
    rather than raising. The motor config is opt-in UX so we'd rather drop
    a malformed value than 422 the whole passage.
    """
    if raw is None:
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0 or v > max_kn:
        return None
    return v


async def _index(_request) -> HTMLResponse:
    return HTMLResponse(LANDING_HTML)


# Connector pickers in chat hosts (Claude, etc.) often scrape the server
# URL's favicon / og:image to badge the connector. Our app responded 404
# on /favicon.ico and the host fell back to HuggingFace branding. Redirect
# every common icon probe to the OhMyWind PNG/SVG hosted on ohmywind.fr.
_ICON_REDIRECTS = {
    "/favicon.ico": "https://ohmywind.fr/favicon.svg",
    "/favicon.svg": "https://ohmywind.fr/favicon.svg",
    "/icon-192.png": "https://ohmywind.fr/icon-192.png",
    "/icon-512.png": "https://ohmywind.fr/icon-512.png",
    "/apple-touch-icon.png": "https://ohmywind.fr/icon-192.png",
    "/apple-touch-icon-precomposed.png": "https://ohmywind.fr/icon-192.png",
}


async def _icon_redirect(request: Request) -> RedirectResponse:
    target = _ICON_REDIRECTS[request.url.path]
    return RedirectResponse(
        target, status_code=302, headers={"Cache-Control": "public, max-age=86400"}
    )


async def _api_archetypes(_request: Request) -> JSONResponse:
    return JSONResponse(list_archetypes_metadata())


async def _api_client_debug(request: Request) -> JSONResponse:
    """Report how this deployment sees the caller, for rate-limit diagnosis.

    The rate limiter keys on the client address taken from the last
    ``X-Forwarded-For`` hop. Whether that address is the real caller or a
    fixed proxy address is a property of the hosting platform, and it cannot
    be observed from outside: a single-bucket-for-everyone bug looks exactly
    like "you share a NAT with someone busy". Two callers on different
    networks comparing ``bucket`` here tell the two apart in one request each.

    ``forwarded_hops == 0`` is the alarm: the platform strips the header, the
    fallback address is an internal proxy, and every caller shares one bucket.
    Returns no address, only a fingerprint of the caller's own.
    """
    return JSONResponse(
        {
            "bucket": bucket_id(request.scope),
            "forwarded_hops": forwarded_hop_count(request.scope),
            # What the deployment is configured for, versus what this request
            # actually earned. They diverge when the caller reached the Space
            # directly instead of through the edge proxy, which is exactly the
            # case that must not get the longer hop count.
            "trusted_hops": TRUSTED_PROXY_HOPS,
            "hops_applied": trusted_hops_for(request.scope),
            "via_edge": came_through_edge(request.scope),
        },
        headers={"Cache-Control": "no-store"},
    )


async def _api_passage(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=422)

    missing = [k for k in ("waypoints", "departure", "archetype") if body.get(k) is None]
    if missing:
        return JSONResponse({"error": f"missing fields: {missing}"}, status_code=422)

    try:
        departure = datetime.fromisoformat(body["departure"])
    except (ValueError, TypeError) as exc:
        return JSONResponse({"error": f"invalid departure: {exc}"}, status_code=422)

    try:
        waypoints = [Point(lat=float(w[0]), lon=float(w[1])) for w in body["waypoints"]]
    except (TypeError, IndexError, ValueError) as exc:
        return JSONResponse({"error": f"invalid waypoints: {exc}"}, status_code=422)

    # Bounds are checked before any upstream call: an out-of-range point used
    # to reach Open-Meteo and come back as a misleading "forecast horizon
    # exceeded". Message passed through verbatim so "at least 2 waypoints
    # required" stays byte-identical for the front's error mapping.
    try:
        validate_waypoints(waypoints)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)

    efficiency: float = body.get("efficiency", 0.75)
    try:
        efficiency = float(efficiency)
    except (TypeError, ValueError) as exc:
        return JSONResponse({"error": f"invalid efficiency: {exc}"}, status_code=422)

    try:
        polar_override = _parse_polar(body.get("polar"))
    except ValueError as exc:
        return JSONResponse({"error": f"invalid polar: {exc}"}, status_code=422)
    model_chain = _translate_models(body.get("models"))

    try:
        cache_adapter = _build_cache_adapter(body.get("forecast_cache"))
    except ValueError as exc:
        return JSONResponse({"error": f"invalid forecast_cache: {exc}"}, status_code=422)
    if cache_adapter is not None:
        # The cache's models are already backend slugs in priority order; use
        # them as the chain so AUTO only walks models actually sampled client-side.
        model_chain = cache_adapter.models

    # Sweep mode — triggered when ``latest_departure`` is provided.
    latest_raw = body.get("latest_departure")
    if latest_raw is not None:
        try:
            latest_departure = datetime.fromisoformat(latest_raw)
        except (ValueError, TypeError) as exc:
            return JSONResponse({"error": f"invalid latest_departure: {exc}"}, status_code=422)
        try:
            sweep_interval = int(body.get("sweep_interval_hours", 1))
        except (TypeError, ValueError) as exc:
            return JSONResponse({"error": f"invalid sweep_interval_hours: {exc}"}, status_code=422)

        target_eta_raw = body.get("target_eta")
        target_eta_dt: datetime | None = None
        if target_eta_raw is not None:
            try:
                target_eta_dt = datetime.fromisoformat(target_eta_raw)
            except (ValueError, TypeError) as exc:
                return JSONResponse({"error": f"invalid target_eta: {exc}"}, status_code=422)

        try:
            reports = await estimate_passage_windows(
                waypoints,
                departure,
                latest_departure,
                body["archetype"],
                sweep_interval_hours=sweep_interval,
                efficiency=efficiency,
                model="auto",
                polar_override=polar_override,
                model_chain=model_chain,
                adapter=cache_adapter,
            )
        except KeyError as exc:
            return JSONResponse({"error": f"unknown archetype: {exc}"}, status_code=422)
        except ValueError as exc:
            return JSONResponse({"error": str(exc)}, status_code=422)
        except ForecastHorizonError as exc:
            return JSONResponse({"error": str(exc)}, status_code=422)
        except NoModelCoveredError as exc:
            return JSONResponse({"error": str(exc)}, status_code=422)
        except httpx.TimeoutException:
            return JSONResponse(
                {"error": "upstream weather service did not respond in time"},
                status_code=503,
            )
        except UpstreamRateLimitError as exc:
            return JSONResponse({"error": str(exc)}, status_code=503)

        # Sweep is partial-tolerant: estimate_passage_windows skips windows
        # that hit ForecastHorizonError. Compute the expected count to surface
        # a meta-warning if some were dropped.
        expected_windows = (
            int((latest_departure - departure).total_seconds() / 3600 / sweep_interval) + 1
        )
        skipped_count = max(0, expected_windows - len(reports))

        windows: list[dict[str, Any]] = []
        for report in reports:
            score = score_complexity(report)
            # Include the full passage + complexity per window so a frontend
            # drill-down ("click a row → see detail") needs zero re-fetch.
            # The summary fields above (`complexity` partial, `conditions_summary`,
            # `duration_h`, `distance_nm`) stay for compact table rendering.
            windows.append(
                {
                    "departure": report.departure_time.isoformat(),
                    "arrival": report.arrival_time.isoformat(),
                    "duration_h": round(report.duration_h, 2),
                    "distance_nm": round(report.distance_nm, 1),
                    "complexity": {
                        "level": score.level,
                        "label": score.label,
                        "tws_max_kn": round(score.tws_max_kn, 1),
                        "rationale": score.rationale,
                    },
                    "conditions_summary": build_conditions_summary(report),
                    "warnings": list(report.warnings) + [w.message for w in score.warnings],
                    "passage": _to_json(report),
                    "complexity_full": _to_json(score),
                }
            )

        meta_warnings: list[str] = []
        if skipped_count > 0:
            meta_warnings.append(
                f"{skipped_count} fenêtre(s) ignorée(s) faute de couverture météo "
                f"(horizon dépassé) : affichage des {len(windows)} restantes."
            )
        if target_eta_dt is not None:
            tol = timedelta(hours=2).total_seconds()
            target_utc = target_eta_dt.astimezone(UTC)
            filtered = [
                w
                for w in windows
                if abs((datetime.fromisoformat(w["arrival"]) - target_utc).total_seconds()) <= tol
            ]
            if not filtered:
                meta_warnings.append(
                    f"aucune fenêtre n'arrive dans ±2h de target_eta={target_eta_raw} ; "
                    f"toutes les {len(windows)} fenêtres retournées"
                )
            else:
                windows = filtered

        return JSONResponse(
            {
                "mode": "multi_window",
                "sweep": {
                    "earliest": departure.isoformat(),
                    "latest": latest_departure.isoformat(),
                    "interval_hours": sweep_interval,
                    "window_count": len(windows),
                },
                "windows": windows,
                "meta_warnings": meta_warnings,
                "forecast_updated_at": datetime.now(UTC).isoformat(),
            }
        )

    # Single mode.
    try:
        passage = await estimate_passage(
            waypoints,
            departure,
            body["archetype"],
            efficiency=efficiency,
            model="auto",
            polar_override=polar_override,
            model_chain=model_chain,
            adapter=cache_adapter,
        )
    except KeyError as exc:
        return JSONResponse({"error": f"unknown archetype: {exc}"}, status_code=422)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except ForecastHorizonError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except NoModelCoveredError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except httpx.TimeoutException:
        return JSONResponse(
            {"error": "upstream weather service did not respond in time"},
            status_code=503,
        )
    except UpstreamRateLimitError as exc:
        return JSONResponse({"error": str(exc)}, status_code=503)

    complexity = score_complexity(passage)

    return JSONResponse(
        {
            "passage": _to_json(passage),
            "complexity": _to_json(complexity),
            "forecast_updated_at": datetime.now(UTC).isoformat(),
        }
    )


async def _api_passage_by_eta(request: Request) -> JSONResponse:
    """ETA-driven passage planner: caller pins arrival, solver finds departure.

    Body matches `_api_passage` minus `departure` and plus `target_arrival`
    (ISO-8601, timezone-aware). Optional `tolerance_minutes` (default 10) and
    `max_iterations` (default 4) tune the fixed-point solver.

    Response shape mirrors `_api_passage` single mode and adds an `eta` block:
        {target_arrival, iterations, residual_seconds, converged}.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=422)

    missing = [k for k in ("waypoints", "target_arrival", "archetype") if body.get(k) is None]
    if missing:
        return JSONResponse({"error": f"missing fields: {missing}"}, status_code=422)

    try:
        target_arrival = datetime.fromisoformat(body["target_arrival"])
    except (ValueError, TypeError) as exc:
        return JSONResponse({"error": f"invalid target_arrival: {exc}"}, status_code=422)

    try:
        waypoints = [Point(lat=float(w[0]), lon=float(w[1])) for w in body["waypoints"]]
    except (TypeError, IndexError, ValueError) as exc:
        return JSONResponse({"error": f"invalid waypoints: {exc}"}, status_code=422)

    # Bounds are checked before any upstream call: an out-of-range point used
    # to reach Open-Meteo and come back as a misleading "forecast horizon
    # exceeded". Message passed through verbatim so "at least 2 waypoints
    # required" stays byte-identical for the front's error mapping.
    try:
        validate_waypoints(waypoints)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)

    try:
        efficiency = float(body.get("efficiency", 0.75))
    except (TypeError, ValueError) as exc:
        return JSONResponse({"error": f"invalid efficiency: {exc}"}, status_code=422)

    try:
        polar_override = _parse_polar(body.get("polar"))
    except ValueError as exc:
        return JSONResponse({"error": f"invalid polar: {exc}"}, status_code=422)
    model_chain = _translate_models(body.get("models"))

    try:
        cache_adapter = _build_cache_adapter(body.get("forecast_cache"))
    except ValueError as exc:
        return JSONResponse({"error": f"invalid forecast_cache: {exc}"}, status_code=422)
    if cache_adapter is not None:
        model_chain = cache_adapter.models

    try:
        plan = await estimate_passage_for_arrival(
            waypoints,
            target_arrival,
            body["archetype"],
            efficiency=efficiency,
            model="auto",
            polar_override=polar_override,
            model_chain=model_chain,
            adapter=cache_adapter,
        )
    except KeyError as exc:
        return JSONResponse({"error": f"unknown archetype: {exc}"}, status_code=422)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except ForecastHorizonError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except NoModelCoveredError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except httpx.TimeoutException:
        return JSONResponse(
            {"error": "upstream weather service did not respond in time"},
            status_code=503,
        )
    except UpstreamRateLimitError as exc:
        return JSONResponse({"error": str(exc)}, status_code=503)

    complexity = score_complexity(plan.report)

    return JSONResponse(
        {
            "passage": _to_json(plan.report),
            "complexity": _to_json(complexity),
            "eta": {"target_arrival": plan.target_arrival.isoformat()},
            "forecast_updated_at": datetime.now(UTC).isoformat(),
        }
    )


# Module-level MARC registry — loaded once at import. Empty registry when
# MARC_ATLAS_DIR is unset or the dataset wasn't pulled (build without
# HF_TOKEN secret), so the overlay endpoint silently returns covered=false.
_MARC_REGISTRY = MarcAtlasRegistry.from_directory(os.environ.get("MARC_ATLAS_DIR", ""))
# SHOM Atlas C2D registry — same lifecycle as MARC. Empty when SHOM_C2D_DIR
# is unset or the dataset doesn't ship the SHOM artefacts. When populated,
# SHOM takes priority for currents on covered points; SHOM ships no tide
# heights so the tide_height_m + z0_hydro_m fields stay on MARC regardless.
_SHOM_REGISTRY = ShomC2dRegistry.from_directory(os.environ.get("SHOM_C2D_DIR", ""))


# ---------------------------------------------------------------------------
async def _api_marc_overlay(request: Request) -> JSONResponse:
    """Return MARC PREVIMER currents and tide-height predictions for a point.

    Designed as a low-overhead overlay on top of Open-Meteo Marine: the web
    client calls Open-Meteo direct from the browser (per-IP scaling, no
    backend bottleneck) and in parallel calls this endpoint. When ``covered``
    is true, the client overrides Open-Meteo currents and tide_height_m with
    the MARC values; otherwise (Mediterranean, open ocean, polar regions),
    the client keeps the Open-Meteo response unchanged.

    Query params:
      ``lat``, ``lon`` -- required floats.
      ``start``, ``end`` -- required ISO-8601 timestamps (UTC assumed).
      ``step_minutes`` -- optional, default 60 (hourly series).

    Response shape (always 200 to avoid client-side 404 noise):
      ``{"covered": false}`` when outside MARC coverage.
      ``{"covered": true, "current_source": "marc_finis_250m",
         "atlas_resolution_m": 250, "z0_hydro_m": -3.85, "times": [...],
         "current_speed_kn": [...], "current_direction_to_deg": [...],
         "tide_height_m": [...]}`` when covered.

    Cache: 1 day (predictions are deterministic harmonics, time-series only
    differs per requested ``[start, end, step]``).
    """
    try:
        lat = float(request.query_params["lat"])
        lon = float(request.query_params["lon"])
        start = datetime.fromisoformat(request.query_params["start"])
        end = datetime.fromisoformat(request.query_params["end"])
    except (KeyError, ValueError, TypeError) as exc:
        return JSONResponse(
            {"error": f"missing or invalid query params (lat, lon, start, end): {exc}"},
            status_code=422,
        )
    try:
        validate_point(lat, lon)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    step_minutes = 60
    if "step_minutes" in request.query_params:
        try:
            step_minutes = int(request.query_params["step_minutes"])
        except ValueError:
            return JSONResponse({"error": "step_minutes must be an integer"}, status_code=422)
        if step_minutes < 5 or step_minutes > 360:
            return JSONResponse(
                {"error": "step_minutes must be between 5 and 360"}, status_code=422
            )

    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if end <= start:
        return JSONResponse({"error": "end must be after start"}, status_code=422)
    span_days = (end - start).total_seconds() / 86400
    if span_days > 30:
        return JSONResponse({"error": "time window must be at most 30 days"}, status_code=422)

    marc_loaded = bool(_MARC_REGISTRY.atlases)
    shom_covers = _SHOM_REGISTRY.covers(lat, lon)
    cell = _MARC_REGISTRY.cell_at(lat, lon) if marc_loaded else None
    # If neither MARC nor SHOM has anything at this point, return uncovered
    # so the client keeps its Open-Meteo SMOC baseline.
    if cell is None and not shom_covers:
        if not marc_loaded:
            return JSONResponse(
                {"covered": False, "reason": "no atlas dataset loaded on this Space"},
                headers={"Cache-Control": "public, max-age=300"},
            )
        return JSONResponse(
            {"covered": False},
            headers={"Cache-Control": "public, max-age=86400"},
        )

    n_steps = int((end - start).total_seconds() // (step_minutes * 60)) + 1
    times = [start + timedelta(minutes=step_minutes * i) for i in range(n_steps)]

    # MARC gives heights + currents on a regular grid (when covered); SHOM
    # gives hand-curated currents only (no heights). Tide always comes from
    # MARC because SHOM C2D ships no height series.
    h_result = _MARC_REGISTRY.predict_height_series(lat, lon, times) if cell else None
    marc_c_result = _MARC_REGISTRY.predict_current_series(lat, lon, times) if cell else None
    shom_c_result = _SHOM_REGISTRY.predict_current_series(lat, lon, times) if shom_covers else None

    # Cascade for currents: SHOM > MARC. atlas_resolution_m and z0_hydro_m
    # stay on MARC because SHOM resolution varies per cartouche and SHOM
    # has no chart-datum reference.
    if shom_c_result is not None:
        c_speeds_dirs_source: tuple[Any, Any, str] | None = shom_c_result
        atlas_resolution_m = None
    elif marc_c_result is not None:
        c_speeds_dirs_source = marc_c_result
        atlas_resolution_m = next(
            (a.resolution_m for a in _MARC_REGISTRY.atlases if cell and a.name == cell.atlas_name),
            None,
        )
    else:
        c_speeds_dirs_source = None
        atlas_resolution_m = None

    payload: dict[str, Any] = {
        "covered": True,
        "atlas_resolution_m": atlas_resolution_m,
        "z0_hydro_m": cell.z0_hydro_m if cell else None,
        "times": [t.isoformat() for t in times],
        # National tidal coefficient at the start of the requested window
        # (Brest-anchored, integer in [20, 120]). Surfaced whenever the
        # SHOM registry has Brest constants loaded so the web client can
        # render the "Coef 87 — vives-eaux" pill alongside the tide chart.
        "tide_coefficient": _SHOM_REGISTRY.tide_coefficient(start)
        if _SHOM_REGISTRY.ref_ports
        else None,
    }
    if h_result is not None:
        payload["tide_height_m"] = [round(float(v), 4) for v in h_result[0]]
    if c_speeds_dirs_source is not None:
        speeds, dirs, source = c_speeds_dirs_source
        payload["current_speed_kn"] = [round(float(v), 4) for v in speeds]
        payload["current_direction_to_deg"] = [round(float(v), 2) for v in dirs]
        # SHOM source already comes as "shom_c2d_<atlas>_<zone>"; MARC needs
        # to be reformatted into the canonical "marc_<atlas>_<res>m" pattern.
        if source.lower().startswith("shom_c2d_"):
            payload["current_source"] = source.lower()
        elif cell and atlas_resolution_m:
            payload["current_source"] = f"marc_{cell.atlas_name.lower()}_{atlas_resolution_m}m"
        else:
            payload["current_source"] = source.lower()
    elif h_result is not None and cell and atlas_resolution_m:
        payload["current_source"] = f"marc_{cell.atlas_name.lower()}_{atlas_resolution_m}m"
    return JSONResponse(
        payload,
        headers={"Cache-Control": "public, max-age=86400"},
    )


def build_app(mcp_app: Any) -> Starlette:
    """Assemble the parent Starlette app around a mounted FastMCP app.

    Split out of ``main`` so tests can exercise routing and middleware without
    booting uvicorn or a real MCP session manager.
    """
    return Starlette(
        routes=[
            Route("/", _index),
            *[Route(path, _icon_redirect, methods=["GET"]) for path in _ICON_REDIRECTS],
            Route("/api/v1/archetypes", _api_archetypes, methods=["GET"]),
            Route("/api/v1/_client", _api_client_debug, methods=["GET"]),
            Route("/api/v1/passage", _api_passage, methods=["POST"]),
            Route("/api/v1/passage-by-eta", _api_passage_by_eta, methods=["POST"]),
            Route("/api/v1/marine/marc", _api_marc_overlay, methods=["GET"]),
            Mount("/", app=mcp_app),
        ],
        # Order matters: the first entry is the outermost wrapper. CORS sits
        # outside the limiter so a 429 still carries the Access-Control-Allow-*
        # headers — otherwise the browser reports an opaque CORS failure and
        # the real cause never reaches the user.
        middleware=[
            Middleware(
                CORSMiddleware,
                allow_origins=ALLOWED_ORIGINS,
                allow_methods=["GET", "POST", "OPTIONS"],
                allow_headers=["Content-Type"],
                # Retry-After is set on our 429s, but a cross-origin fetch only
                # sees the CORS-safelisted response headers unless the server
                # opts the rest in here. Without this the web app cannot tell
                # the user how long to wait and has to guess — which is how the
                # copy ended up hard-coding "une minute" for a 5-minute window.
                expose_headers=["Retry-After"],
            ),
            Middleware(SecurityHeadersMiddleware),
            Middleware(RateLimitMiddleware),
        ],
        lifespan=mcp_app.router.lifespan_context,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    warn_if_edge_secret_missing()
    server = build_server()
    server.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=ALLOWED_HOSTS,
    )
    # FastMCP only mounts ``/mcp``; wrap with a parent Starlette so visiting
    # the Space root returns a human-readable landing page instead of 404.
    # Order matters: the exact-match ``/`` route is tried before the catch-all
    # ``Mount("/")`` so MCP traffic on ``/mcp`` is unaffected.
    #
    # Critically, FastMCP's session manager is started/stopped by the inner
    # app's lifespan. A parent Starlette does NOT propagate child lifespans,
    # so we must hand the inner lifespan to the parent — without this the MCP
    # endpoint returns 500 because the streamable-http session manager never
    # initialised.
    app = build_app(server.streamable_http_app())
    # Run uvicorn explicitly (rather than ``server.run(transport=...)``) so we
    # can enable ``proxy_headers``/``forwarded_allow_ips``. HF terminates TLS
    # at the edge; without these flags ASGI sees ``http`` + the internal Host
    # and emits broken redirects.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
