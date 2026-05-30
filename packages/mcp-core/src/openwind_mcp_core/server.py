"""FastMCP server factory.

`build_server()` returns a `FastMCP` instance with all tools registered. It is
cloud-agnostic: no Gradio, no `huggingface_hub`. The HF Spaces wrapper, the
local stdio runner, and any future deployment all import this same factory.

Tools exposed (V1):

1. ``list_boat_archetypes`` — descriptive list for LLM mapping ("Sun Odyssey 32"
   → ``cruiser_30ft``). No server-side mapping table.
2. ``get_marine_forecast`` — wind+sea around a point/window for one or more models.
3. ``plan_passage`` — single-shot end-to-end: timing along the polyline,
   1-5 complexity score, rendered MCP App widget, and openwind.fr deep-link.

## Rich rendering (MCP Apps)

``plan_passage`` declares ``_meta.ui.resourceUri`` pointing at
``ui://openwind/plan-passage`` — a sandboxed HTML resource that iframes
``openwind.fr/plan?...``. Hosts that support the MCP Apps spec (Claude,
Claude Desktop, ChatGPT, VS Code Copilot, Goose, Postman, MCPJam — see the
`extension client matrix`_) render the widget inline. Hosts that do NOT
support MCP Apps (Cursor, Le Chat, terminal, …) silently fall back to the
tool's text response: a compact summary plus the ``openwind_url`` deep link.

The dead-on-arrival ``html`` field that older versions returned has been
dropped — relying on every host to render arbitrary HTML in chat was fragile
by design (see PR #74 for the full reasoning).

.. _extension client matrix: https://modelcontextprotocol.io/extensions/client-matrix
"""

from __future__ import annotations

import os
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

from mcp.server.fastmcp import FastMCP
from openwind_data.adapters.base import MarineDataAdapter
from openwind_data.adapters.openmeteo import AUTO_MODEL, OpenMeteoAdapter
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry
from openwind_data.routing import (
    Point,
    _build_conditions_summary,
    list_archetypes,
)
from openwind_data.routing import (
    estimate_passage as _estimate_passage,
)
from openwind_data.routing import (
    estimate_passage_windows as _estimate_passage_windows,
)
from openwind_data.routing import (
    score_complexity as _score_complexity,
)

from .feedback import (
    FeedbackCategory,
    FeedbackSeverity,
    FeedbackSink,
    FeedbackToolName,
    build_feedback_entry,
    stderr_sink,
)
from .render import build_openwind_url

# MCP Apps UI resource URI for plan_passage. The host fetches this resource
# and renders it in a sandboxed iframe; the resource itself iframes
# openwind.fr/plan, so the rendered widget IS the live web app — single
# source of truth, no duplicate widget code to maintain.
PLAN_UI_RESOURCE_URI = "ui://openwind/plan-passage"
PLAN_UI_MIME = "text/html;profile=mcp-app"
# unpkg serves the official @modelcontextprotocol/ext-apps SDK bundle that
# implements the ui/initialize -> ui/notifications/initialized handshake and
# the ui/notifications/tool-result listener. Same CDN as the official
# qr-server / say-server / threejs-server examples.
PLAN_UI_RESOURCE_DOMAINS = ["https://unpkg.com"]

# Body of the MCP Apps UI resource. Uses the official @modelcontextprotocol/
# ext-apps SDK from unpkg for the handshake (same pattern as qr-server /
# say-server / threejs-server reference examples in the ext-apps repo).
#
# Why we render the content INLINE rather than via a nested iframe to
# openwind.fr/plan: Claude.ai (as of 2026-05) does not honour the
# ``frameDomains`` CSP field — the inner iframe is blocked even when our
# resource declares ``_meta.ui.csp.frameDomains: ["https://openwind.fr"]``.
# Inspect with the network tab: ``mcp_apps?resource-src=https://unpkg.com``
# shows our ``resourceDomains`` got mapped to ``resource-src``, but no
# corresponding ``frame-src`` is added → the openwind.fr load gets a CSP
# refusal. Until that's fixed in the host, render the data directly. The
# CTA still links to openwind.fr (target="_blank") for the full app.
_PLAN_WIDGET_HTML = """<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>OpenWind</title>
  <style>
    :root{
      --bg:#FAF7EE;--card:#FFFFFF;--fg0:#1A1A1A;--fg1:#3F3F3F;--fg2:#777169;
      --line:#E2DDCD;--accent:#1D9E75;--accent-soft:#E8F4EE;
      --c1:#2dc97a;--c2:#8fcc30;--c3:#e8c432;--c4:#e87a18;--c5:#e84118;
    }
    @media (prefers-color-scheme:dark){
      :root{
        --bg:#15140F;--card:rgba(255,255,255,0.04);--fg0:#F2F2F2;--fg1:#D4D2CB;
        --fg2:#888780;--line:rgba(255,255,255,0.10);
        --accent:#2BBE93;--accent-soft:rgba(43,190,147,0.12);
      }
    }
    *{box-sizing:border-box}
    html,body{margin:0;background:var(--bg);color:var(--fg0);
      font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
    body{padding:1rem}
    .root{max-width:48rem;margin:0 auto}
    .placeholder{padding:2rem;text-align:center;color:var(--fg2)}
    h2{margin:0 0 .35rem;font-size:1.1rem;letter-spacing:-.01em}
    .sub{color:var(--fg2);font-size:.85rem;margin:0 0 1rem}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:0 0 1rem}
    .stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem}
    .stat .l{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;
      color:var(--fg2);font-weight:700;margin:0 0 .2rem}
    .stat .v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-weight:700;font-size:.95rem;color:var(--fg0)}
    .badge{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .6rem;
      border-radius:8px;font-weight:700;font-size:.8rem;border-width:1px;border-style:solid}
    .badge .dot{width:.55rem;height:.55rem;border-radius:50%}
    .warn{background:rgba(232,196,50,.10);border:1px solid rgba(232,196,50,.35);
      color:#a07900;padding:.5rem .7rem;border-radius:8px;font-size:.8rem;margin:.4rem 0}
    @media (prefers-color-scheme:dark){.warn{color:#e8c432}}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem;margin-top:.5rem}
    th{text-align:left;font-weight:700;color:var(--fg2);font-size:.65rem;
      text-transform:uppercase;letter-spacing:.08em;padding:.4rem .5rem;border-bottom:1px solid var(--line)}
    td{padding:.5rem;border-bottom:1px solid var(--line);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fg1)}
    .num{width:1.4rem;height:1.4rem;border-radius:50%;display:inline-flex;
      align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.7rem}
    .cta{display:inline-block;margin-top:1rem;padding:.55rem 1rem;background:var(--accent);
      color:#fff !important;text-decoration:none;border-radius:8px;font-weight:700;font-size:.85rem}
    .cta:hover{filter:brightness(1.05)}
    .windows-row{cursor:pointer;transition:background .12s}
    .windows-row:hover{background:var(--accent-soft)}
    a{color:var(--accent)}
  </style>
</head>
<body>
  <div id="root" class="root">
    <div class="placeholder">Chargement du plan…</div>
  </div>
  <script type="module">
    import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@0.4.0/app-with-deps";

    const CX_COLORS = {1:"#2dc97a",2:"#8fcc30",3:"#e8c432",4:"#e87a18",5:"#e84118"};
    const SAIL = {pres:"Près",travers:"Travers",largue:"Largue",portant:"Portant"};

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"
      }[c]));
    }
    function fmtTime(iso){
      try{return new Date(iso).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}
      catch(e){return iso;}
    }
    function fmtDate(iso){
      try{
        const d = new Date(iso);
        return d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})
             + " · " + d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      }catch(e){return iso;}
    }
    function fmtDur(h){
      if(h==null) return "—";
      const hh=Math.floor(h), mm=Math.round((h-hh)*60);
      return mm>0 ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`;
    }
    function cxLevel(tws){
      if(tws<10)return 1; if(tws<15)return 2; if(tws<20)return 3; if(tws<25)return 4; return 5;
    }
    function pointOfSail(twa){
      const a = Math.abs(twa); // already 0..180 from server
      if(a<60)return "Près"; if(a<100)return "Travers";
      if(a<150)return "Largue"; return "Portant";
    }

    function badge(level, label){
      const c = CX_COLORS[level] || CX_COLORS[3];
      return `<span class="badge" style="background:${c}22;color:${c};border-color:${c}55">
        <span class="dot" style="background:${c}"></span>${level}/5 — ${escapeHtml(label||"")}
      </span>`;
    }

    function renderSingle(sc){
      const p = sc.passage || {};
      const cx = sc.complexity || {};
      const segs = p.segments || [];
      const warnings = (p.warnings||[]).concat((cx.warnings||[]).map(w=>w.message||w));
      const url = sc.openwind_url || "https://openwind.fr/plan";
      const stats = [
        ["Distance", (p.distance_nm||0).toFixed(1)+" nm"],
        ["Durée",    fmtDur(p.duration_h)],
        ["Arrivée",  fmtTime(p.arrival_time)],
        ["Modèle",   (p.model||"").replace(/_/g," ")],
      ];
      const legRows = segs.map((s,i)=>{
        const lvl = cxLevel(s.tws_kn||0);
        const c = CX_COLORS[lvl];
        const bs = s.boat_speed_kn != null ? s.boat_speed_kn.toFixed(1)+" kn" : "—";
        const tws = s.tws_kn != null ? Math.round(s.tws_kn)+" kn" : "—";
        const hs = s.hs_m != null ? s.hs_m.toFixed(1)+" m" : "—";
        return `<tr>
          <td><span class="num" style="background:${c}">${i+1}</span></td>
          <td>${fmtTime(s.end_time)}</td>
          <td>${pointOfSail(s.twa_deg||0)}</td>
          <td>${tws}</td>
          <td>${hs}</td>
          <td>${bs}</td>
        </tr>`;
      }).join("");
      return `
        <h2>Plan de passage</h2>
        <p class="sub">${segs.length} tronçon${segs.length>1?"s":""} · ${(p.distance_nm||0).toFixed(1)} nm</p>
        <div class="stats">${stats.map(([l,v])=>`
          <div class="stat"><div class="l">${l}</div><div class="v">${escapeHtml(v)}</div></div>
        `).join("")}</div>
        ${badge(cx.level||3, cx.label||"")}
        ${warnings.map(w=>`<div class="warn">⚠ ${escapeHtml(w)}</div>`).join("")}
        ${segs.length ? `<table>
          <thead><tr><th>#</th><th>Heure</th><th>Allure</th><th>Vent</th><th>Mer</th><th>Vitesse</th></tr></thead>
          <tbody>${legRows}</tbody>
        </table>` : ""}
        <a class="cta" href="${escapeHtml(url)}" rel="noopener">Voir le plan complet sur openwind.fr →</a>
      `;
    }

    function fmtHsRange(min, max){
      if(min == null && max == null) return "—";
      if(min == null) return `${max.toFixed(1)} m`;
      if(max == null) return `${min.toFixed(1)} m`;
      const a = min.toFixed(1), b = max.toFixed(1);
      return a === b ? `${a} m` : `${a}-${b} m`;
    }

    function renderCompare(sc){
      const windows = sc.windows || [];
      const sweep = sc.sweep || {};
      const meta = sc.meta_warnings || [];
      const rows = windows.map((w,idx)=>{
        const cs = w.conditions_summary || {};
        const cx = w.complexity || {};
        const c = CX_COLORS[cx.level] || CX_COLORS[3];
        const tws = (cs.tws_min_kn != null && cs.tws_max_kn != null)
          ? `${Math.round(cs.tws_min_kn)}-${Math.round(cs.tws_max_kn)} kn` : "—";
        const sail = SAIL[cs.predominant_sail_angle] || cs.predominant_sail_angle || "—";
        const sea = fmtHsRange(cs.hs_min_m, cs.hs_max_m);
        return `<tr class="windows-row" data-window-idx="${idx}" tabindex="0" role="link">
          <td>${fmtDate(w.departure)}</td>
          <td>${fmtDur(w.duration_h)}</td>
          <td>${fmtTime(w.arrival)}</td>
          <td>${escapeHtml(sail)}</td>
          <td>${tws}</td>
          <td>${sea}</td>
          <td><span class="num" style="background:${c}">${cx.level||"?"}</span></td>
        </tr>`;
      }).join("");
      return `
        <h2>Comparaison de ${windows.length} fenêtres</h2>
        <p class="sub">Du ${fmtDate(sweep.earliest)} au ${fmtDate(sweep.latest)} · pas de ${sweep.interval_hours||"?"}h</p>
        ${meta.map(m=>`<div class="warn">${escapeHtml(m)}</div>`).join("")}
        <table>
          <thead><tr><th>Départ</th><th>Durée</th><th>ETA</th><th>Allure</th><th>Vent</th><th>Mer</th><th>⚡</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="sub" style="margin-top:.75rem">Cliquez pour aller directement au routage de cette journée</p>
      `;
    }

    // Hold the latest structured content so the delegated click handler can
    // resolve a row index back to its openwind_url.
    let lastSc = null;
    const app = new App({ name: "OpenWind Plan", version: "1.0.0" });

    function openUrl(url){
      // Sandboxed iframes silently drop window.open / target=_blank without
      // `allow-popups`. The MCP Apps spec exposes a host-mediated open via
      // app.openLink — works even inside a strict sandbox.
      if(!url) return;
      app.openLink({ url }).catch(err => {
        console.error('[openwind] openLink failed', err);
        // Last-resort: attempt window.open just in case (will silently fail
        // in a sandbox without allow-popups).
        try { window.open(url, '_blank', 'noopener'); } catch(e) {}
      });
    }

    function wireClicks(){
      const root = document.getElementById('root');
      // Compare-mode rows
      root.querySelectorAll('.windows-row').forEach(tr=>{
        tr.addEventListener('click', ()=>{
          const idx = Number(tr.dataset.windowIdx);
          const w = lastSc && lastSc.windows && lastSc.windows[idx];
          if(w && w.openwind_url) openUrl(w.openwind_url);
        });
        tr.addEventListener('keydown', e=>{
          if(e.key === 'Enter' || e.key === ' '){
            e.preventDefault(); tr.click();
          }
        });
      });
      // Single-mode CTA links (any .cta or [data-openlink])
      root.querySelectorAll('a.cta, a[data-openlink]').forEach(a=>{
        a.addEventListener('click', e=>{
          e.preventDefault();
          openUrl(a.getAttribute('href'));
        });
      });
    }

    function render(result){
      const sc = result && result.structuredContent;
      if(!sc) return;
      lastSc = sc;
      const root = document.getElementById('root');
      try {
        if(sc.mode === "multi_window") root.innerHTML = renderCompare(sc);
        else if(sc.passage) root.innerHTML = renderSingle(sc);
        wireClicks();
      } catch(e) {
        console.error('[openwind] render failed', e);
        const url = (sc.openwind_url || (sc.windows && sc.windows[0] && sc.windows[0].openwind_url) || "https://openwind.fr/plan");
        root.innerHTML = `<div class="placeholder">
          Impossible d'afficher le plan ici.
          <br><a class="cta" href="${escapeHtml(url)}" rel="noopener">Ouvrir sur openwind.fr →</a>
        </div>`;
        wireClicks();
      }
    }

    app.ontoolresult = render;
    try { await app.connect(); }
    catch (e) { console.error('[openwind] MCP App connect failed', e); }
  </script>
</body>
</html>
"""


def _archetype_summary(p: Any) -> dict[str, Any]:
    return {
        "name": p.name,
        "length_ft": p.length_ft,
        "type": p.type,
        "category": p.category,
        "performance_class": p.performance_class,
        "examples": list(p.examples),
    }


def _passage_to_dict(report: Any) -> dict[str, Any]:
    """asdict() but with datetimes serialized to ISO strings."""
    d = asdict(report)
    d["departure_time"] = report.departure_time.isoformat()
    d["arrival_time"] = report.arrival_time.isoformat()
    for seg, out in zip(report.segments, d["segments"], strict=True):
        out["start_time"] = seg.start_time.isoformat()
        out["end_time"] = seg.end_time.isoformat()
    return d


_METHODOLOGY = """\
# OpenWind — Calculation method

How `plan_passage` simulates a passage. Defaults below are what the server
uses unless overridden by tool parameters.

## Polar speed model

- 7 ORC-style archetypes (cruiser_20ft / cruiser_25ft / cruiser_30ft /
  cruiser_40ft / cruiser_50ft / racer_cruiser / catamaran_40ft).
- Lookup is bilinear interpolation in (TWS, TWA), clamped at grid edges.
- TWA symmetric on [0, 180] only (no port/starboard distinction).

## Boat speed adjustments

- Efficiency factor (default 0.75): ORC polars are theoretical maxima;
  real cruising loses ~25% (sail trim, comfort margins, helm). Override
  per call: 0.85 racing, 0.65 loaded family cruising, 0.55 heavy seas /
  fouled hull.

- VMG / tacking correction: when route TWA is below the boat's optimal
  upwind angle (typically ~42-48 deg), the simulator assumes the sailor
  tacks at the optimal VMG angle. Effective speed toward destination =
  polar(opt_TWA) * cos(opt_TWA - route_TWA). At dead upwind this reduces
  to polar(opt) * cos(opt) ~= polar / sqrt(2). At route_TWA=20 deg with
  opt=45 deg, the reduction is only cos(25 deg) ~= 0.91 (much less penalty).

- Wave derate (opt-in): max(0.5, 1 - 0.05 * Hs^1.75 * cos^2(TWA/2)).
  Off by default; sea state feeds the warning bar instead of slowing.

- Currents: SOG = STW + (current projected on bearing). Projection uses
  the oceanographic "going to" convention. Cascade source priority:
  MARC PREVIMER atlases (Ifremer, 250 m on critical Atlantic passes;
  700 m on the Manche / Bay of Biscay shelf; 2 km on the wider North-East
  Atlantic) when the waypoint falls inside a covered emprise; otherwise
  Open-Meteo Marine (SMOC, 8 km global). Each leg surfaces a
  ``current_source`` field so the caller knows which product applied
  (e.g. ``marc_finis_250m``, ``marc_manga_700m``, ``openmeteo_smoc``).
  MARC delivers harmonic prediction (tidal + 2008-2009 mean residual)
  and excludes short-term wind-driven surge, which Open-Meteo SMOC
  captures globally. Even the MARC atlases do not replace a SHOM tide
  atlas or paper chart for fine navigation in a narrow pass.

- Current confidence (``current_confidence`` per leg): qualitative tag
  derived from the data source. ``"high"`` on SHOM Atlas C2D and MARC
  PREVIMER (regional harmonic atlases); ``"medium"`` on Open-Meteo SMOC
  (8 km global product); ``None`` when no current data is available.
  A data-driven downgrade in choke points (zones where SHOM C2D peaks
  exceed ~3 kt) will land with the C2D adapter.

- Minimum boat speed / SOG: 0.5 kn floor to avoid blow-up in extreme
  stalls or strongly opposing currents.

## Timing

- Single-pass approximation: a 6 kn heuristic estimates segment mid-times,
  then real polar speeds are computed at each mid-time's actual wind. No
  convergence iteration. Bias bounded by Mediterranean wind correlation.
- Routes split into ~10 nm sub-segments by default for weather sampling.

## Compare-windows mode

`plan_passage` accepts an optional `latest_departure` that turns the call
into a window comparison: it walks N hourly departures over the same route
and returns one entry per window. Weather is fetched once (cache prewarm),
simulations are in-memory. Hard cap: 14 d x 24 h = 336 windows. The LLM
picks qualitatively (no server-side ranking).

## Regional defaults

- Wind model: AROME 1.3 km (<= 48 h horizon, captures thermals and
  local winds, covers French Atlantic + Mediterranean). Auto-falls back
  to ICON-EU (<= 5 d) -> ECMWF IFS 0.25 deg (<= 10 d) -> GFS (<= 16 d).
- Wave / current / tide model: Open-Meteo Marine (Hs / period / direction,
  ocean current velocity + direction, sea level height MSL).
- Surfacing thresholds: currents reported when >= 0.3 kt; tide range
  reported when >= 0.5 m. Below these, the data is omitted as noise.
- Mediterranean: tides typically < 40 cm and currents typically below
  0.3 kt, so most legs surface only wind + waves.
- Atlantic: tidal range exceeds 10 m on the Manche; tidal currents
  exceed 5 kt in narrow passes — these become first-class signals.

## Wind-against-current

When current >= 1.5 kt and the wind setting (twd + 180 deg) is opposed
to the current setting by more than 120 deg, the leg is flagged ("mer
hachee probable") and the overall complexity level is bumped by +1
(capped at 5). Mirrors nautical practice: chop builds when wind blows
into a contrary tide.

## Short-period chop ("clapot")

Independently of currents, a steep wind sea is flagged when the
steepness proxy Hs / Tp^2 exceeds 0.05 on a segment with Hs >= 0.8 m
(e.g. Hs 1.0 m at Tp 4.5 s). This catches short fetch-built chop in
fresh breeze even without contrary current — typical of a Mistral or
Tramontane lee shore. Bump and warning mirror the wind-against-current
case; the +1 bump is shared, so a passage with both signals does not
jump +2.

When *every* triggering segment is on a running angle (|TWA| >= 120°,
sea coming from behind), the warning becomes "Clapot suiveur" and the
+1 bump is skipped. The boat surfs with the wave rather than slamming
into it; broaching and accidental gybe risks remain, hence the warning,
but the underlying complexity is unchanged.

## What is NOT modelled (V1)

- No automatic routing optimisation (LLM + human choose).
- No coastal acceleration zones (caller adds intermediate waypoints).
- No port/starboard polar asymmetry, no spinnaker-specific curves.
- No hull condition modelling beyond the `efficiency` knob.

## Data attributions

- Wind: Open-Meteo Forecast API (CC BY 4.0). AROME by Meteo-France.
- Sea state and global currents: Open-Meteo Marine API (Mercator SMOC).
- High-resolution French tide / current atlases: PREVIMER MARC project
  (Ifremer + SHOM cofinancement EU). Cite when republishing predictions
  derived from MARC: Pineau-Guillou Lucia (2013), "PREVIMER -
  Validation des atlas de composantes harmoniques de hauteurs et
  courants de maree", Rapport Ifremer, 89 p.
  http://archimer.ifremer.fr/doc/00157/26801/
"""


def _build_window_dict(
    report: Any, score: Any, waypoints_raw: list[dict[str, float]]
) -> dict[str, Any]:
    dep_iso = report.departure_time.isoformat()
    warnings = list(report.warnings) + [w.message for w in score.warnings]
    return {
        "departure": dep_iso,
        "arrival": report.arrival_time.isoformat(),
        "duration_h": round(report.duration_h, 2),
        "distance_nm": round(report.distance_nm, 1),
        "complexity": {
            "level": score.level,
            "label": score.label,
            "tws_max_kn": round(score.tws_max_kn, 1),
            "rationale": score.rationale,
        },
        "conditions_summary": _build_conditions_summary(report),
        "warnings": warnings,
        "openwind_url": build_openwind_url(waypoints_raw, dep_iso, report.archetype),
    }


def build_server(
    *,
    adapter: MarineDataAdapter | None = None,
    feedback_sink: FeedbackSink | None = None,
) -> FastMCP:
    """Build a FastMCP server with all OpenWind tools registered.

    Args:
        adapter: optional `MarineDataAdapter` used by data-fetching tools.
            Defaults to a ``CompositeMarineAdapter`` that wraps a fresh
            ``OpenMeteoAdapter`` and stacks two coastal-detail sources on
            top: the SHOM Atlas C2D registry under ``SHOM_C2D_DIR`` (when
            built and shipped), and the MARC PREVIMER atlases under
            ``MARC_ATLAS_DIR``. Either or both can be absent; the cascade
            degrades gracefully (SHOM > MARC > SMOC). Override the whole
            adapter in tests.
        feedback_sink: optional callable invoked by the ``feedback`` tool
            with the normalized entry dict. ``mcp-core`` stays cloud-agnostic
            (no ``huggingface_hub`` import); the HF Spaces wrapper plugs in
            a ``CommitScheduler``-backed sink that pushes to a private
            dataset. Defaults to ``stderr_sink`` for local dev.
    """
    sink: FeedbackSink = feedback_sink or stderr_sink
    # ``stateless_http=True`` disables the in-memory session table that
    # otherwise tracks an ``mcp-session-id`` per client across requests.
    # All OpenWind tools are idempotent point-in-time fetches with no
    # cross-call state, so stateless is strictly correct AND removes a
    # whole class of intermittent failures: any restart of the HF Space
    # process (cold-start after sleep, sync redeploy, OOM) wipes the
    # session table, and clients still holding an old session-id from a
    # prior process life get a JSON-RPC ``-32600 "Session not found"``.
    # With the flag on this can't happen.
    #
    # ``json_response=True`` switches the streamable-http response type
    # from SSE chunks to a single JSON envelope. We don't emit progress
    # notifications, so SSE buys nothing here. JSON also plays nicer
    # with intermediaries (HF's edge proxy, browser fetch, Postman).
    #
    # Per the official MCP Python SDK README, this combo is the
    # recommended config for production deployments.
    server: FastMCP = FastMCP(
        "openwind",
        stateless_http=True,
        json_response=True,
    )
    if adapter is not None:
        fetch_adapter: MarineDataAdapter = adapter
    else:
        upstream = OpenMeteoAdapter()
        marc_dir = os.environ.get("MARC_ATLAS_DIR")
        shom_dir = os.environ.get("SHOM_C2D_DIR")
        marc_registry = MarcAtlasRegistry.from_directory(marc_dir) if marc_dir else None
        shom_registry = ShomC2dRegistry.from_directory(shom_dir) if shom_dir else None
        marc_available = marc_registry is not None and bool(marc_registry.atlases)
        shom_available = shom_registry is not None and shom_registry.lats.size > 0
        if marc_available:
            fetch_adapter = CompositeMarineAdapter(
                upstream=upstream,
                marc=marc_registry,  # type: ignore[arg-type]
                shom=shom_registry if shom_available else None,
            )
        else:
            # Without MARC the composite adapter has nothing to override
            # currents with on the shelf; we keep upstream Open-Meteo only.
            # (SHOM alone in the composite would still work, but mixing
            # SHOM-only zones with raw SMOC elsewhere is more readable
            # via the existing two-tier composite once MARC lands.)
            fetch_adapter = upstream

    @server.resource(
        PLAN_UI_RESOURCE_URI,
        name="OpenWind plan widget",
        mime_type=PLAN_UI_MIME,
        meta={
            "ui": {
                "csp": {
                    # Allow the SDK bundle from unpkg (same CDN as the
                    # official ext-apps examples). No `frameDomains` because
                    # the widget renders inline — Claude.ai 2026-05 doesn't
                    # honour `frameDomains` anyway, see comment on
                    # `_PLAN_WIDGET_HTML`.
                    "resourceDomains": PLAN_UI_RESOURCE_DOMAINS,
                }
            }
        },
    )
    def plan_widget_resource() -> str:
        """MCP Apps UI resource — renders the plan inline (no nested iframe).

        Receives the tool's ``structuredContent`` over postMessage (per the
        MCP Apps spec — the host pushes results to the iframe via a
        JSON-RPC dialect on the postMessage channel) and binds the inner
        iframe's ``src`` to ``openwind_url`` from the result.

        Defensive against multiple message shapes — different hosts have
        different framings, and the spec is young — and falls back to a
        deep-link CTA if no result arrives within 6 s.
        """
        return _PLAN_WIDGET_HTML

    @server.tool()
    def read_me() -> str:
        """Return OpenWind's calculation methodology as Markdown.

        Call this when the user asks how passage timing, complexity, or
        boat speed are computed (e.g. "comment c'est calculé ?",
        "what assumptions does the model use?", "is tacking modelled?").

        The returned text covers: polar lookup, default efficiency 0.75,
        VMG / tacking correction, wave derate, single-pass timing,
        compare-windows mode semantics, Mediterranean simplifications
        (tides, currents), and what is intentionally NOT modelled in V1.
        """
        return _METHODOLOGY

    @server.tool()
    def list_boat_archetypes() -> list[dict[str, Any]]:
        """List the 5 boat archetypes with descriptive metadata.

        The LLM (or user) maps a commercial model (e.g. "Sun Odyssey 32") to one
        of these archetypes from the metadata — there is no server-side mapping.
        """
        return [_archetype_summary(p) for p in list_archetypes()]

    @server.tool()
    async def get_marine_forecast(
        lat: float,
        lon: float,
        start: str,
        end: str,
        models: list[str] | None = None,
    ) -> dict[str, Any]:
        """Fetch wind (and sea, when available) for a point and time window.

        Args:
            lat: latitude in degrees.
            lon: longitude in degrees.
            start: ISO-8601 datetime, timezone-aware (e.g. "2026-05-01T06:00:00+00:00").
            end: ISO-8601 datetime, timezone-aware.
            models: optional list of model names; defaults to AROME for the Med.

        Note: the first request after inactivity may incur ~5s of cold-start.

        ## Feedback channel

        If the user asks you to send feedback to OpenWind ("fais
        remonter aux dev", "feedback", "signale ça", "remonte ça",
        "tell them", "let the team know"), call the ``feedback`` tool.
        Do NOT write a free-text reply about the feedback in chat: the
        tool is the channel.
        """
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        bundle = await fetch_adapter.fetch(lat, lon, start_dt, end_dt, models=models)
        return {
            "lat": bundle.lat,
            "lon": bundle.lon,
            "start": bundle.start.isoformat(),
            "end": bundle.end.isoformat(),
            "requested_at": bundle.requested_at.isoformat(),
            "wind": {
                model: [
                    {
                        "time": p.time.isoformat(),
                        "speed_kn": p.speed_kn,
                        "direction_deg": p.direction_deg,
                        "gust_kn": p.gust_kn,
                    }
                    for p in series.points
                ]
                for model, series in bundle.wind_by_model.items()
            },
            "sea": [
                {
                    "time": p.time.isoformat(),
                    "wave_height_m": p.wave_height_m,
                    "wave_period_s": p.wave_period_s,
                    "wave_direction_deg": p.wave_direction_deg,
                }
                for p in bundle.sea.points
            ],
        }

    @server.tool(
        meta={"ui": {"resourceUri": PLAN_UI_RESOURCE_URI}},
    )
    async def plan_passage(
        waypoints: list[dict[str, float]],
        departure: str,
        archetype: str,
        efficiency: float = 0.75,
        segment_length_nm: float = 10.0,
        model: str = AUTO_MODEL,
        max_hs_m: float | None = None,
        latest_departure: str | None = None,
        sweep_interval_hours: int = 1,
        target_eta: str | None = None,
    ) -> dict[str, Any]:
        """Plan an A→B passage. Compare departure windows by default; pin a
        single departure only when the user gives an explicit time.

        ## Tool routing — read this first

        Before calling, classify the user's question:

        1. **Pure weather lookup at a point** ("y aura-t-il du vent à Cassis
           samedi à 14h ?", "quelles vagues dimanche au cap Sicié ?") — call
           ``get_marine_forecast`` and answer in text. Do NOT call
           ``plan_passage``: there's no route to plan.

        2. **Trajet question with a flexible date** ("Marseille → Porquerolles
           ce week-end", "demain ou après-demain", "dans les prochains jours")
           — call ``plan_passage`` in **compare-windows mode**: pass
           ``latest_departure`` (e.g. earliest+48h) and ``sweep_interval_hours``
           (3 or 6 typically) so the user sees several departure scenarios
           side-by-side. Then pick 2-3 good ones and let the user choose.
           This is the **default** for trajet planning — same API cost as a
           single passage thanks to cache prewarm, much more value.

        3. **Trajet with a precise hour pinned by the user** ("je pars demain
           à 8h", "départ Saturday 9am") — call ``plan_passage`` in single
           mode (no ``latest_departure``). Used for the final "show me the
           detailed plan for THIS departure" view, often after step 2.

        4. **Methodology question** ("comment c'est calculé ?",
           "quelle efficacité par défaut ?") — call ``read_me``.

        Rule of thumb: if the user does NOT give an exact hour, prefer
        compare-windows. The widget renders one of the windows by default
        and the chat lets the user pick another.

        ## Returned payload

        Single mode:

        - ``passage``: per-segment timing report (distance_nm, duration_h,
          model used, segments[] with TWS/TWA/boat_speed/Hs, warnings).
        - ``complexity``: 1-5 difficulty score with wind/sea breakdown and a
          human-readable rationale.
        - ``openwind_url``: deep-link to openwind.fr/plan that renders the
          same passage in the standalone web app.

        Compare-windows mode (``latest_departure`` set):

        - ``mode``: ``"multi_window"``.
        - ``sweep``: ``earliest`` / ``latest`` / ``interval_hours`` /
          ``window_count``.
        - ``windows[]``: each entry has ``departure``, ``arrival``,
          ``duration_h``, ``distance_nm``, ``complexity`` (level + label +
          rationale), ``conditions_summary`` (tws_min/max, predominant sail
          angle, hs_min/max), ``warnings``, ``passage`` (full per-segment
          report), ``complexity_full`` (full score), ``openwind_url``.
        - ``meta_warnings``: top-level notes ("3 fenêtres ignorées …").

        ## How it renders

        On hosts that support MCP Apps (Claude, Claude Desktop, ChatGPT, VS
        Code Copilot, Goose, Postman, MCPJam), the response is automatically
        accompanied by an interactive widget — the live openwind.fr/plan view
        served via the ``ui://openwind/plan-passage`` resource declared on
        this tool's ``_meta``. The widget reads ``openwind_url`` from the
        structured output and embeds the matching plan view as an iframe.

        On hosts without MCP Apps support (Cursor, Le Chat, terminal), present
        a short text summary of the result (route, ETA, complexity, warnings)
        and offer ``openwind_url`` as the "View full plan →" link.

        ## ALWAYS include the openwind_url(s) in your text reply

        Even when the widget renders inline, the user wants the link spelled
        out so they can open the full app, share it, or bookmark it. Treat
        this as a hard requirement, not a fallback:

        - **Single mode**: end your reply with a Markdown link, e.g.
          ``[Voir le plan détaillé →](https://openwind.fr/plan?…)``.
        - **Compare-windows mode**: list 2-4 of the most relevant windows
          and give each its own link, e.g.
          ``- Sam 2 mai 09h · 11h12 · ⚡2/5 — [voir →](url)``.
          The user picks one from the chat, not the widget.

        Phrase the link with intent ("voir le plan détaillé", "ouvrir cette
        fenêtre dans l'app"), not just a bare URL — the user should know
        what clicking does.

        ## Args

            waypoints: list of ``{"lat": ..., "lon": ...}`` dicts (>=2). Caller
                keeps the polyline off land — add intermediate waypoints to
                skirt capes and peninsulas.
            departure: ISO-8601 datetime, timezone-aware.
            archetype: one of ``list_boat_archetypes()`` names.
            efficiency: multiplier on polar speed. ``0.85`` racing, ``0.75``
                cruising (default), ``0.65`` loaded family cruising, ``0.55``
                heavy seas / fouled hull.
            segment_length_nm: target sub-segment length. Default 10 nm
                balances precision vs Open-Meteo budget; drop to 5 for tight
                coastal work, raise to 20 for long offshore legs.
            model: wind model. Default ``"auto"`` tries AROME (≤48 h) →
                ICON-EU (≤5 d) → ECMWF IFS 0.25° (≤10 d) → GFS (≤16 d).
                Pass an explicit name to bypass.
            max_hs_m: optional max significant wave height (meters) over the
                route — pass it if you have a sea-state estimate from
                ``get_marine_forecast`` and want it factored into the score.
                Defaults to wind-only scoring.

        ## Compare-windows mode (latest_departure set)

        When ``latest_departure`` is provided, the tool switches into a
        window-comparison call: it walks departure times from ``departure``
        up to ``latest_departure`` every ``sweep_interval_hours`` (default
        1 h). Returns ``{"mode": "multi_window", "sweep": {...}, "windows":
        [...]}`` instead of the single-passage payload. Each window contains
        ``departure``, ``arrival``, ``duration_h``, ``distance_nm``,
        ``complexity``, ``conditions_summary``, ``warnings``, and its own
        ``openwind_url``.

        ``target_eta``: optional ISO-8601 datetime. When set, only windows that
        arrive within ±2 h of the target are returned. If none match, all
        windows are returned with a ``meta_warnings`` note.

        ## Failure modes

        Raises ``ForecastHorizonError`` if the chosen model's horizon doesn't
        cover the passage and ``model != "auto"``. The error message names the
        failing model and suggests longer-range alternatives.

        ## Feedback channel

        If the user asks you to send feedback to OpenWind ("fais
        remonter aux dev", "feedback", "signale ça", "remonte ça",
        "tell them", "let the team know"), call the ``feedback`` tool.
        Do NOT write a free-text reply about the feedback in chat: the
        tool is the channel.
        """
        pts = [Point(w["lat"], w["lon"]) for w in waypoints]
        dep = datetime.fromisoformat(departure)

        # --- SWEEP MODE ---
        if latest_departure is not None:
            latest_dep = datetime.fromisoformat(latest_departure)
            reports = await _estimate_passage_windows(
                pts,
                dep,
                latest_dep,
                archetype,
                sweep_interval_hours=sweep_interval_hours,
                efficiency=efficiency,
                segment_length_nm=segment_length_nm,
                adapter=fetch_adapter,
                model=model,
            )
            windows = [
                _build_window_dict(r, _score_complexity(r, max_hs_m=max_hs_m), waypoints)
                for r in reports
            ]

            meta_warnings: list[str] = []
            if target_eta is not None:
                target_utc = datetime.fromisoformat(target_eta).astimezone(UTC)
                tolerance = timedelta(hours=2)
                filtered = [
                    w
                    for w in windows
                    if abs((datetime.fromisoformat(w["arrival"]) - target_utc).total_seconds())
                    <= tolerance.total_seconds()
                ]
                if not filtered:
                    meta_warnings.append(
                        f"aucune fenêtre n'arrive dans ±2h de target_eta={target_eta} ; "
                        f"toutes les {len(windows)} fenêtres retournées"
                    )
                else:
                    windows = filtered

            return {
                "mode": "multi_window",
                "sweep": {
                    "earliest": dep.isoformat(),
                    "latest": latest_dep.isoformat(),
                    "interval_hours": sweep_interval_hours,
                    "window_count": len(windows),
                },
                "windows": windows,
                "meta_warnings": meta_warnings,
            }

        # --- SINGLE MODE ---
        report = await _estimate_passage(
            pts,
            dep,
            archetype,
            efficiency=efficiency,
            segment_length_nm=segment_length_nm,
            adapter=fetch_adapter,
            model=model,
        )
        score = _score_complexity(report, max_hs_m=max_hs_m)

        return {
            "passage": _passage_to_dict(report),
            "complexity": asdict(score),
            "openwind_url": build_openwind_url(waypoints, departure, archetype),
        }

    @server.tool()
    def feedback(
        category: FeedbackCategory,
        tool_name: FeedbackToolName,
        severity: FeedbackSeverity,
        message: str,
        context_json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Log a structured note about an OpenWind tool interaction.

        ## Direct user trigger — call this immediately, no chat reply

        When the user EXPLICITLY asks you to send feedback / file a
        report / signal something to the OpenWind team, call this tool
        right away. Do NOT draft a free-text reply in chat asking the
        user what they want to say: their phrasing IS the message.
        Pass it (translated or summarised as needed) as the ``message``.

        Trigger phrases (non-exhaustive, French + English):
        ``"fais un feedback"``, ``"fais remonter aux dev"``,
        ``"signale ça"``, ``"remonte ça"``, ``"file a feedback"``,
        ``"send feedback"``, ``"tell them"``, ``"let the team know"``,
        ``"fais un retour à OpenWind"``.

        ## Also call when

        - A previous tool call returned an error you couldn't recover from,
          or a result that contradicts what the user asked
          (``category="wrong_result"``).
        - A parameter description was unclear and you had to guess
          (``category="unclear_param"``).
        - You needed data that no current tool exposes
          (``category="missing_data"`` — for example, official BMS
          bulletins, port closures, fuel stops).
        - The user explicitly asked for a feature that doesn't exist yet
          (``category="feature_request"``).
        - The user expresses dissatisfaction in chat ("c'est faux",
          "ce n'est pas ce que je voulais") about an OpenWind result.

        ## Do NOT call this tool

        - On routine successful calls. Silence is the right answer when
          things work.
        - As a chat acknowledgement. The user does not see your call.
        - Multiple times for the same incident. One feedback per turn,
          per distinct issue.
        - For errors that are clearly the user's input fault (typo in a
          city name, impossible date) — only call when the issue is on
          OpenWind's side or in the tool surface.

        ## Args

            category: nature of the feedback (see triggers above).
            tool_name: which OpenWind tool the feedback is about. Use
                ``"general"`` for cross-cutting feedback, ``"feedback"``
                for meta-feedback about this tool itself.
            severity: ``"low"`` (nice-to-have, doesn't block the user),
                ``"medium"`` (degrades the experience), ``"high"`` (broke
                the user's workflow or returned a misleading result).
            message: short free-text description, max ~2000 chars. Be
                concrete: name the symptom, not the fix. Good: "passage
                from Marseille to Calvi returned distance_nm=0 even
                though waypoints are >100nm apart". Bad: "should fix
                the distance bug".
            context_json: optional dict with reproducer hints — the
                input args you passed, the offending excerpt of the
                response, the user's original phrasing. Capped at ~4000
                chars after JSON serialisation.

        ## Returns

        ``{"feedback_id": <uuid hex>, "received_at": <iso8601>,
        "ack": "thanks"}`` — never raises. If persistence fails on the
        server side it is logged and ``ack`` reflects ``"buffered"``.
        Do not surface the ack to the user; just continue the
        conversation.
        """
        entry = build_feedback_entry(
            category=category,
            tool_name=tool_name,
            severity=severity,
            message=message,
            context_json=context_json,
        )
        ack = "thanks"
        try:
            sink(entry)
        except Exception as exc:
            import logging as _logging

            _logging.getLogger(__name__).warning("openwind.feedback sink failed: %s", exc)
            ack = "buffered"
        return {
            "feedback_id": entry["feedback_id"],
            "received_at": entry["received_at"],
            "ack": ack,
        }

    return server
