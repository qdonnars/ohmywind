# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""FastMCP server factory.

`build_server()` returns a `FastMCP` instance with all tools registered. It is
cloud-agnostic: no Gradio, no `huggingface_hub`. The HF Spaces wrapper, the
local stdio runner, and any future deployment all import this same factory.

Tools exposed (V1):

1. ``list_boat_archetypes`` — descriptive list for LLM mapping ("Sun Odyssey 32"
   → ``cruiser_30ft``). No server-side mapping table.
2. ``get_marine_forecast`` — wind+sea around a point/window for one or more models,
   with current and tide where they matter.
3. ``get_tidal_stream`` — tidal stream and tide at a point, from the tidal
   atlases alone: no weather request.
4. ``plan_passage`` — single-shot end-to-end: timing along the polyline,
   1-5 complexity score, rendered MCP App widget, and ohmywind.fr deep-link.

## Rich rendering (MCP Apps)

``plan_passage`` declares ``_meta.ui.resourceUri`` pointing at
``ui://openwind/plan-passage`` — a sandboxed HTML resource that renders the
plan inline: the figures, a map of the route the model drew, and the per-leg
table. Hosts that support the MCP Apps spec (Claude,
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

import json
import math
import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from openwind_data.adapters.base import (
    CURRENT_RELEVANCE_THRESHOLD_KN,
    TIDE_RANGE_RELEVANCE_THRESHOLD_M,
    ForecastBundle,
    MarineDataAdapter,
    SeaPoint,
    SeaSeries,
)
from openwind_data.adapters.openmeteo import AUTO_MODEL, OpenMeteoAdapter, auto_chain_from
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.narrow_pass import confidence_for_point
from openwind_data.currents.router import CompositeMarineAdapter, compose_marine_adapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry
from openwind_data.currents.tidal_gaps import unresolved_pass_at
from openwind_data.currents.unknown_zones import UNKNOWN_CURRENT_SOURCE
from openwind_data.routing import (
    BoatPolar,
    get_polar,
    list_archetypes,
    parse_waypoints,
    resolve_sweep_interval,
    validate_point,
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
from openwind_data.routing.notices import Notice
from openwind_data.views import (
    filter_windows_by_target_eta,
    passage_envelope,
    sweep_view,
    widened_interval_warning,
    window_view,
)

from .render import WEB_BASE, WEB_HOST, build_explore_url, build_ohmywind_url

# MCP Apps UI resource URI for plan_passage. The host fetches this resource
# and renders it in a sandboxed iframe (see ``_PLAN_WIDGET_HTML`` for why it
# renders the plan itself rather than iframing ohmywind.fr/plan).
#
# The URI keeps its pre-rebrand ``openwind`` segment on purpose: it is an
# identifier hosts resolve, not display copy, so it moves with the Space and
# module renames rather than with this cosmetic pass.
PLAN_UI_RESOURCE_URI = "ui://openwind/plan-passage"
PLAN_UI_MIME = "text/html;profile=mcp-app"

# The name clients display for this server. Named rather than inlined into the
# FastMCP() call so a test can assert it: the cosmetic rebrand shipped with this
# value still on the old brand, because the sweep that renamed everything else
# matched "OpenWind" and "openwind.fr" and this one is lowercase and bare.
SERVER_NAME = "ohmywind"

# Usage warning attached to every plan_passage payload, single mode and
# compare-windows alike. The tool hands back an ETA and a 1-5 complexity score
# that a skipper may act on to decide whether to put to sea, so the caveat
# travels with the numbers instead of living in the docs only.
#
# English on purpose: it is read by the model, not by the user, and the model
# relays it in whatever language the conversation runs in. The French wording
# shown in the web app lives in packages/web/src/plan/SafetyNotice.tsx and the
# English one in the README. All three say the same thing; keep them in sync.
PASSAGE_DISCLAIMER = (
    "Decision-support tool, not a navigation instrument. OhMyWind does not "
    "replace the official marine forecast from the national weather service, "
    "up-to-date charts, or the skipper's judgement. Forecast models are "
    "sometimes wrong: the skipper remains responsible for the passage."
)
# Basemap of the widget's route map: OpenStreetMap's standard raster tiles.
# Keyless, and loaded as plain <img>, which is all the host's CSP has to allow
# (img-src, through resourceDomains). The web app's own basemap, OpenFreeMap
# vector tiles drawn by MapLibre, is out of reach here: MapLibre parses tiles
# in a Web Worker, and the MCP Apps CSP has no worker-src to give it. A plan
# loads a few dozen tiles, well within the OSMF tile usage policy, which also
# asks for the attribution the map shows.
OSM_TILE_ORIGIN = "https://tile.openstreetmap.org"
OSM_TILE_URL = OSM_TILE_ORIGIN + "/{z}/{x}/{y}.png"

# unpkg serves the official @modelcontextprotocol/ext-apps SDK bundle that
# implements the ui/initialize -> ui/notifications/initialized handshake and
# the ui/notifications/tool-result listener (same CDN as the official
# qr-server / say-server / threejs-server examples), and Leaflet, which draws
# the route map.
PLAN_UI_RESOURCE_DOMAINS = ["https://unpkg.com", OSM_TILE_ORIGIN]

# Where the widget finds the legs of each sweep window: in the tool result's
# ``_meta``, which MCP Apps hands to the widget and keeps out of the model's
# context. A sweep row is compact on purpose (see ``window_view``): the legs of
# every window would put up to 336 times the segment count in front of the
# model, for a table only the widget draws.
PLAN_UI_LEGS_META_KEY = "ohmywind.fr/legs"
_LEG_FIELDS = ("end_time", "tws_kn", "twa_deg", "hs_m", "boat_speed_kn")

# Body of the MCP Apps UI resource. Uses the official @modelcontextprotocol/
# ext-apps SDK from unpkg for the handshake (same pattern as qr-server /
# say-server / threejs-server reference examples in the ext-apps repo).
#
# Why we render the content INLINE rather than via a nested iframe to
# ohmywind.fr/plan: Claude.ai (as of 2026-05) does not honour the
# ``frameDomains`` CSP field — the inner iframe is blocked even when our
# resource declares ``_meta.ui.csp.frameDomains: ["https://ohmywind.fr"]``.
# Inspect with the network tab: ``mcp_apps?resource-src=https://unpkg.com``
# shows our ``resourceDomains`` got mapped to ``resource-src``, but no
# corresponding ``frame-src`` is added → the ohmywind.fr load gets a CSP
# refusal. Until that's fixed in the host, render the data directly. The
# CTA still links to ohmywind.fr (target="_blank") for the full app.
_PLAN_WIDGET_HTML = """<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>OhMyWind</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <style>
    :root{
      --bg:#FAF7EE;--card:#FFFFFF;--fg0:#1A1A1A;--fg1:#3F3F3F;--fg2:#777169;
      --line:#E2DDCD;--accent:#1D9E75;--accent-soft:#E8F4EE;
      --c1:#2dc97a;--c2:#8fcc30;--c3:#e8c432;--c4:#e87a18;--c5:#e84118;
      --card-solid:#FFFFFF;--casing:#FFFFFF;--sea:#E4ECEC;
    }
    @media (prefers-color-scheme:dark){
      :root{
        --bg:#15140F;--card:rgba(255,255,255,0.04);--fg0:#F2F2F2;--fg1:#D4D2CB;
        --fg2:#888780;--line:rgba(255,255,255,0.10);
        --accent:#2BBE93;--accent-soft:rgba(43,190,147,0.12);
        --card-solid:#24231E;--casing:#15140F;--sea:#17212A;
      }
    }
    [hidden]{display:none !important}
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
    .tablewrap{overflow-x:auto}
    .tablewrap td{white-space:nowrap}
    td sup{font-size:.62rem;color:var(--fg2);margin-left:1px}
    /* Departures list: the selected row drives everything below it. */
    tr.dep{cursor:pointer}
    tr.dep td{transition:background .12s}
    tr.dep:hover td{background:var(--accent-soft)}
    tr.dep[aria-selected="true"] td{background:var(--accent-soft);color:var(--fg0);font-weight:700}
    tr.dep:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .pick{display:inline-block;width:.8rem;height:.8rem;border-radius:50%;border:2px solid var(--fg2);
      margin-right:.45rem;vertical-align:-.1rem}
    tr.dep[aria-selected="true"] .pick{border-color:var(--accent);
      background:radial-gradient(var(--accent) 45%,transparent 50%)}
    .hint{color:var(--fg2);font-size:.75rem;margin:.45rem 0 0}
    .chosen{margin:1.1rem 0 .6rem;padding-top:.9rem;border-top:1px solid var(--line);display:grid;gap:.45rem}
    .chosen.single{margin-top:0;padding-top:0;border-top:0}
    .chosen .warn{margin:0}
    .chosen-line{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .7rem;font-size:.9rem}
    .chosen-line .meta{color:var(--fg2);font-size:.82rem}
    details.detail summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:.4rem;
      padding:.35rem 0;font-size:.82rem;font-weight:700;color:var(--fg1)}
    details.detail summary::-webkit-details-marker{display:none}
    details.detail summary::before{content:"";width:.45rem;height:.45rem;border-right:2px solid var(--fg2);
      border-bottom:2px solid var(--fg2);transform:rotate(-45deg);transition:transform .15s;margin-right:.15rem}
    details.detail[open] summary::before{transform:rotate(45deg)}
    details.detail summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
    a{color:var(--accent)}
    /* Route map. Muted tiles so the coloured legs read first; in dark mode
       the light OSM tiles are inverted rather than swapped for another
       provider, which would mean another origin in the CSP. */
    .mapwrap{margin:1rem 0}
    .map{height:250px;border-radius:10px;border:1px solid var(--line);overflow:hidden;
      position:relative;background:var(--sea)}
    @media (max-width:480px){.map{height:210px}}
    .mapnote{margin:.45rem 0 0;font-size:.8rem;color:var(--fg1)}
    .mapcap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.25rem 1rem;
      font-size:.72rem;color:var(--fg2);margin-top:.2rem}
    .legend{display:inline-flex;flex-wrap:wrap;gap:.15rem .55rem;align-items:center}
    .legend i{width:.55rem;height:.55rem;border-radius:50%;display:inline-block;margin-right:.2rem}
    .map.leaflet-container{background:var(--sea);font:inherit}
    .map .leaflet-tile-pane{filter:grayscale(.72) contrast(.94) brightness(1.03)}
    @media (prefers-color-scheme:dark){
      .map .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) grayscale(.55) brightness(.82) contrast(.88)}
    }
    .map .leaflet-bar{border:1px solid var(--line);box-shadow:none}
    .map .leaflet-bar a,.map .leaflet-bar a:hover{background:var(--card-solid);color:var(--fg0);
      border-bottom-color:var(--line);width:26px;height:26px;line-height:26px}
    .map .leaflet-bar a.leaflet-disabled{color:var(--fg2);opacity:.6}
    .map .leaflet-control-attribution{background:color-mix(in srgb,var(--bg) 82%,transparent);
      color:var(--fg2);font-size:10px}
    .map .leaflet-control-attribution a{color:var(--fg1)}
    .map .ow-icon{background:none;border:0}
    .segnum{display:flex;align-items:center;justify-content:center;width:20px;height:20px;
      border-radius:50%;color:#fff;font-weight:700;font-size:11px;border:2px solid var(--casing);
      box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .12s,opacity .12s;cursor:pointer}
    .segnum.dim{opacity:.35}
    .segnum.hl{transform:scale(1.3)}
    .map .leaflet-tooltip.ow-tip{background:var(--card-solid);color:var(--fg0);border:1px solid var(--line);
      box-shadow:0 1px 3px rgba(0,0,0,.18);font-weight:700;font-size:11px;padding:1px 6px;border-radius:6px}
    .map .leaflet-tooltip.ow-tip::before{display:none}
    .recenter{cursor:pointer;background:var(--card-solid);color:var(--fg0);border:1px solid var(--line);
      border-radius:6px;font:700 11px/1.2 inherit;padding:5px 8px}
    .wheelhint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      text-align:center;padding:1rem;background:rgba(10,10,8,.5);color:#fff;font-weight:600;
      font-size:.85rem;z-index:1001;opacity:0;pointer-events:none;transition:opacity .2s}
    .wheelhint.on{opacity:1}
    .has-map tr.leg{cursor:pointer}
    .has-map tr.leg td{transition:background .12s}
    .has-map tr.leg:hover td,.has-map tr.leg.is-hl td{background:var(--accent-soft)}
    .has-map tr.leg:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    @media (prefers-reduced-motion:reduce){
      .segnum,.wheelhint,tr.dep td,.has-map tr.leg td,details.detail summary::before{transition:none}
    }
  </style>
</head>
<body>
  <div id="root" class="root">
    <div class="placeholder">Chargement du plan…</div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
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
        <span class="dot" style="background:${c}"></span>${level}/5 · ${escapeHtml(label||"")}
      </span>`;
    }

    function fmtHsRange(min, max){
      if(min == null && max == null) return "—";
      if(min == null) return `${max.toFixed(1)} m`;
      if(max == null) return `${min.toFixed(1)} m`;
      const a = min.toFixed(1), b = max.toFixed(1);
      return a === b ? `${a} m` : `${a}-${b} m`;
    }
    // Calendar days between two instants, in the viewer's zone: a 20 h
    // passage lands at "02:27", and the time alone hides that it is the
    // next day.
    function dayShift(a, b){
      const day = iso => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
      return Math.round((day(b) - day(a)) / 864e5);
    }
    function plusDays(a, b){
      const n = dayShift(a, b);
      return n > 0 ? `<sup>+${n}</sup>` : "";
    }

    // ---- One shape for both modes ----
    // A run is one departure and its legs: a pinned departure gives one, a
    // sweep one per window. Everything under the departures list reads the
    // selected run, so both modes render through the same code.
    const LEGS_META_KEY = "__LEGS_META_KEY__";

    function runsOf(sc, meta){
      if(sc.mode !== "multi_window"){
        const p = sc.passage || {};
        const cx = sc.complexity || {};
        return [{
          departure: p.departure_time, arrival: p.arrival_time, duration_h: p.duration_h,
          distance_nm: p.distance_nm || 0, model: p.model, complexity: cx, url: sc.openwind_url,
          warnings: (p.warnings||[]).concat((cx.warnings||[]).map(w=>w.message||w)),
          legs: (p.segments||[]).map(s=>({ll:[[s.start.lat, s.start.lon], [s.end.lat, s.end.lon]],
            end_time:s.end_time, tws:s.tws_kn, twa:s.twa_deg, hs:s.hs_m, bs:s.boat_speed_kn})),
        }];
      }
      // Sweep windows carry no legs: they come in the result's _meta, kept
      // out of the model's context. A host that drops _meta still gets the
      // list and the route, without per-departure colours or detail.
      const m = meta && meta[LEGS_META_KEY];
      const g = m && m.geometry;
      const at = k => m.fields.indexOf(k);
      return (sc.windows||[]).map((w,i)=>{
        const rows = m && m.windows && m.windows[i];
        const legs = g && rows && rows.length === g.length - 1
          ? rows.map((r,j)=>({ll:[g[j], g[j+1]], end_time:r[at("end_time")], tws:r[at("tws_kn")],
              twa:r[at("twa_deg")], hs:r[at("hs_m")], bs:r[at("boat_speed_kn")]}))
          : null;
        return {
          departure: w.departure, arrival: w.arrival, duration_h: w.duration_h,
          distance_nm: w.distance_nm || 0, complexity: w.complexity || {}, url: w.openwind_url,
          warnings: w.warnings || [], summary: w.conditions_summary || {}, legs,
        };
      });
    }

    function listBlock(runs, sel){
      const rows = runs.map((r,i)=>{
        const cs = r.summary;
        const c = CX_COLORS[r.complexity.level] || CX_COLORS[3];
        const tws = (cs.tws_min_kn != null && cs.tws_max_kn != null)
          ? `${Math.round(cs.tws_min_kn)}-${Math.round(cs.tws_max_kn)} kn` : "—";
        const sail = SAIL[cs.predominant_sail_angle] || cs.predominant_sail_angle || "—";
        return `<tr class="dep" data-i="${i}" tabindex="0" aria-selected="${i === sel}">
          <td><span class="pick" aria-hidden="true"></span>${fmtDate(r.departure)}</td>
          <td>${fmtDur(r.duration_h)}</td>
          <td>${fmtTime(r.arrival)}${plusDays(r.departure, r.arrival)}</td>
          <td>${escapeHtml(sail)}</td>
          <td>${tws}</td>
          <td>${fmtHsRange(cs.hs_min_m, cs.hs_max_m)}</td>
          <td><span class="num" style="background:${c}">${r.complexity.level||"?"}</span></td>
        </tr>`;
      }).join("");
      return `<div class="tablewrap"><table role="grid" aria-label="Départs possibles">
          <thead><tr><th>Départ</th><th>Durée</th><th>Arrivée</th><th>Allure</th><th>Vent</th><th>Mer</th><th>⚡</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="hint">Sélectionnez un départ pour voir sa route et son détail.</p>`;
    }

    function statsBlock(r){
      const shift = dayShift(r.departure, r.arrival);
      const stats = [
        ["Distance", r.distance_nm.toFixed(1)+" nm"],
        ["Durée",    fmtDur(r.duration_h)],
        ["Arrivée",  fmtTime(r.arrival) + (shift > 0 ? ` +${shift}` : "")],
        ["Modèle",   (r.model||"").replace(/_/g," ")],
      ];
      return `<div class="stats">${stats.map(([l,v])=>`
        <div class="stat"><div class="l">${l}</div><div class="v">${escapeHtml(v)}</div></div>
      `).join("")}</div>`;
    }

    function chosenBlock(r, multi){
      const cx = r.complexity;
      const head = multi
        ? `<div class="chosen-line"><b>Départ ${fmtDate(r.departure)}</b>
            <span class="meta">arrivée ${fmtDate(r.arrival)} · ${fmtDur(r.duration_h)}</span>
            ${badge(cx.level||3, cx.label||"")}</div>`
        : `<div class="chosen-line">${badge(cx.level||3, cx.label||"")}</div>`;
      return head + r.warnings.map(w=>`<div class="warn">⚠ ${escapeHtml(w)}</div>`).join("");
    }

    // Collapsed by default: the list and the map carry the answer, the legs
    // are there for whoever wants the numbers. The choice sticks across
    // departures.
    let detailOpen = false;
    function detailBlock(r, multi){
      if(!r.legs || !r.legs.length) return "";
      const rows = r.legs.map((l,i)=>{
        const c = CX_COLORS[cxLevel(l.tws||0)];
        return `<tr class="leg" data-seg="${i}">
          <td><span class="num" style="background:${c}">${i+1}</span></td>
          <td>${fmtTime(l.end_time)}</td>
          <td>${pointOfSail(l.twa||0)}</td>
          <td>${l.tws != null ? Math.round(l.tws)+" kn" : "—"}</td>
          <td>${l.hs != null ? l.hs.toFixed(1)+" m" : "—"}</td>
          <td>${l.bs != null ? l.bs.toFixed(1)+" kn" : "—"}</td>
        </tr>`;
      }).join("");
      const n = r.legs.length;
      const title = multi
        ? `Détail par tronçon · départ ${fmtTime(r.departure)}`
        : `Détail par tronçon · ${n} tronçon${n>1?"s":""}`;
      return `<details class="detail"${detailOpen ? " open" : ""}><summary>${title}</summary>
        <div class="tablewrap"><table>
          <thead><tr><th>#</th><th>Heure</th><th>Allure</th><th>Vent</th><th>Mer</th><th>Vitesse</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div></details>`;
    }

    function renderSingle(sc, r){
      const n = r.legs.length;
      return `
        <h2>Plan de passage</h2>
        <p class="sub">${n} tronçon${n>1?"s":""} · ${r.distance_nm.toFixed(1)} nm</p>
        ${statsBlock(r)}
        <div class="chosen single" id="ow-chosen">${chosenBlock(r, false)}</div>
        ${mapBlock(routePoints(sc), r.distance_nm,
          "Tracé envoyé par l'assistant : le vent et la mer sont lus le long de cette ligne, tronçon par tronçon.",
          n > 0)}
        <div id="ow-detail">${detailBlock(r, false)}</div>
        <a class="cta" id="ow-cta" href="${escapeHtml(r.url || "__WEB_BASE__/plan")}" rel="noopener">Voir le plan complet sur __WEB_HOST__ →</a>
      `;
    }

    function renderCompare(sc, runs, sel){
      const sweep = sc.sweep || {};
      const meta = sc.meta_warnings || [];
      const r = runs[sel];
      const below = r ? `
        <div class="chosen" id="ow-chosen">${chosenBlock(r, true)}</div>
        ${mapBlock(routePoints(sc), r.distance_nm,
          r.legs ? "Tracé envoyé par l'assistant, coloré selon le vent de chaque tronçon pour ce départ."
                 : "Tracé envoyé par l'assistant, le même pour tous les départs.",
          !!r.legs)}
        <div id="ow-detail">${detailBlock(r, true)}</div>
        <a class="cta" id="ow-cta" href="${escapeHtml(r.url || "__WEB_BASE__/plan")}" rel="noopener">Voir ce départ sur __WEB_HOST__ →</a>
      ` : "";
      return `
        <h2>Comparaison de ${runs.length} départ${runs.length>1?"s":""}</h2>
        <p class="sub">Du ${fmtDate(sweep.earliest)} au ${fmtDate(sweep.latest)} · pas de ${sweep.interval_hours||"?"}h</p>
        ${meta.map(m=>`<div class="warn">${escapeHtml(m)}</div>`).join("")}
        ${runs.length ? listBlock(runs, sel) : ""}
        ${below}
      `;
    }

    // ---- Route map ----
    // Draws the polyline the model sent, so the user sees what the figures
    // were computed along and can catch a leg drawn wrong. Leaflet and the
    // tiles come from the two origins the resource's CSP declares: if the
    // host drops Leaflet the plan renders without a map, if it drops only
    // the tiles the route is drawn on a plain sea background.
    const TILE_URL = "__TILE_URL__";
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // ``mapApi`` is what the list and the detail rows talk to: repaint the
    // legs for a departure, light one leg, zoom on one leg.
    let map = null, mapObserver = null, mapApi = null;

    function routePoints(sc){
      if(typeof L === "undefined") return null;
      if(Array.isArray(sc.waypoints) && sc.waypoints.length > 1)
        return sc.waypoints.map(w=>[w.lat, w.lon]);
      // A payload from before ``waypoints``: the segment ends draw the same
      // line, with the 10 nm subdivisions marked as if they were waypoints.
      const segs = (sc.passage && sc.passage.segments) || [];
      if(!segs.length) return null;
      return [[segs[0].start.lat, segs[0].start.lon]].concat(segs.map(s=>[s.end.lat, s.end.lon]));
    }

    function mapBlock(pts, distNm, note, withLegend){
      if(!pts) return "";
      const legend = withLegend ? `<span class="legend">Vent du tronçon :
        ${[[1,"&lt;10"],[2,"10-15"],[3,"15-20"],[4,"20-25"],[5,"25+ kn"]].map(([l,t])=>
          `<span><i style="background:${CX_COLORS[l]}"></i>${t}</span>`).join("")}</span>` : "";
      return `<div class="mapwrap">
        <div class="map" id="ow-map"><div class="wheelhint" aria-hidden="true">Zoom : boutons + et &minus;, ou double-clic</div></div>
        <p class="mapnote">${note}</p>
        <div class="mapcap"><span>${pts.length} points · ${distNm.toFixed(1)} nm</span>${legend}</div>
      </div>`;
    }

    function teardownMap(){
      if(mapObserver){ mapObserver.disconnect(); mapObserver = null; }
      if(map){ map.remove(); map = null; }
      mapApi = null;
    }

    function buildMap(sc, run){
      const el = document.getElementById('ow-map');
      const pts = routePoints(sc);
      if(!el || !pts || !run) return;
      const css = getComputedStyle(document.documentElement);
      const casing = css.getPropertyValue('--casing').trim();
      const ink = css.getPropertyValue('--fg0').trim();
      const accent = css.getPropertyValue('--accent').trim();
      const bounds = L.latLngBounds(pts);
      // No wheel zoom and, on touch screens, no one-finger drag: inside a
      // chat both belong to scrolling the conversation. Buttons, double-tap
      // and pinch still zoom.
      map = L.map(el, {scrollWheelZoom:false, dragging:!L.Browser.mobile, zoomSnap:.25,
        maxZoom:16, maxBounds:bounds.pad(1), fadeAnimation:!REDUCED, zoomAnimation:!REDUCED});
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILE_URL, {maxZoom:16,
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);

      // "Vue d'ensemble" shows once the user zooms or pans off the whole
      // route, and puts it back.
      let fitting = false, moved = false;
      function fit(){
        if(!el.clientWidth) return;
        fitting = true;
        map.fitBounds(bounds, {padding:[28,28], animate:false});
        fitting = false;
      }
      const Recenter = L.Control.extend({onAdd(){
        const b = L.DomUtil.create('button', 'recenter');
        b.type = 'button'; b.textContent = "Vue d'ensemble"; b.hidden = true;
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', ()=>{ moved = false; b.hidden = true; fit(); });
        return b;
      }});
      const recenter = new Recenter({position:'topright'}).addTo(map).getContainer();
      map.on('zoomstart dragstart', ()=>{ if(!fitting){ moved = true; recenter.hidden = false; } });

      // One leg per detail row, same colour and number. Without legs (a host
      // that dropped _meta), one neutral trace.
      const legColor = (r, i) => r.legs && r.legs[i] ? CX_COLORS[cxLevel(r.legs[i].tws||0)] : accent;
      const segs = (run.legs || []).map((l,i)=>{
        const c = legColor(run, i);
        const halo = L.polyline(l.ll, {color:casing, weight:8, opacity:.95, lineCap:'round'}).addTo(map);
        const line = L.polyline(l.ll, {color:c, weight:4.5, lineCap:'round'}).addTo(map);
        const mid = [(l.ll[0][0]+l.ll[1][0])/2, (l.ll[0][1]+l.ll[1][1])/2];
        const bubble = L.marker(mid, {keyboard:false, icon:L.divIcon({className:'ow-icon',
          iconSize:[20,20], iconAnchor:[10,10],
          html:`<div class="segnum" style="background:${c}">${i+1}</div>`})}).addTo(map);
        return {ll:l.ll, halo, line, bubble};
      });
      if(!segs.length){
        L.polyline(pts, {color:casing, weight:8, opacity:.95, lineCap:'round', lineJoin:'round'}).addTo(map);
        L.polyline(pts, {color:accent, weight:4.5, lineCap:'round', lineJoin:'round'}).addTo(map);
      }

      // Short legs crowd their numbers together at the overview zoom: show a
      // number only when it clears the last one shown. Zooming in brings the
      // others back, and so does hovering their row.
      function declutter(){
        let last = null;
        segs.forEach(s=>{
          const node = s.bubble.getElement();
          if(!node) return;
          const pt = map.latLngToContainerPoint(s.bubble.getLatLng());
          const show = !last || pt.distanceTo(last) >= 24;
          node.style.visibility = show ? '' : 'hidden';
          if(show) last = pt;
        });
      }
      map.on('zoomend', declutter);

      // The waypoints as sent; departure and arrival filled and labelled.
      const ends = [];
      const dots = pts.map((p,i)=>{
        const end = i === 0 || i === pts.length-1;
        const m = L.circleMarker(p, {radius:end?6:4, color:end?casing:ink, weight:2,
          fillColor:end?ink:'#ffffff', fillOpacity:1, interactive:false}).addTo(map);
        if(end){
          m.bindTooltip(i === 0 ? "Départ" : "Arrivée", {permanent:true,
            direction:i === 0 ? 'right' : 'bottom', offset:i === 0 ? [8,0] : [0,8], className:'ow-tip'});
          ends.push(m);
        }
        return m;
      });

      // Colour the legs and label the ends for one departure: the selected
      // one, or the one under the pointer in the list.
      function paint(r){
        segs.forEach((s,i)=>{
          const c = legColor(r, i);
          s.line.setStyle({color:c});
          const b = s.bubble.getElement() && s.bubble.getElement().querySelector('.segnum');
          if(b) b.style.background = c;
        });
        const shift = dayShift(r.departure, r.arrival);
        ends[0].setTooltipContent("Départ " + fmtTime(r.departure));
        ends[1].setTooltipContent("Arrivée " + fmtTime(r.arrival) + (shift > 0 ? ` +${shift}` : ""));
      }
      function highlight(i){
        segs.forEach((s,j)=>{
          const on = i == null || i === j;
          s.line.setStyle({opacity:on ? 1 : .3, weight:i === j ? 7 : 4.5});
          s.halo.setStyle({opacity:on ? .95 : .3, weight:i === j ? 11 : 8});
          const b = s.bubble.getElement() && s.bubble.getElement().querySelector('.segnum');
          if(b){ b.classList.toggle('dim', !on); b.classList.toggle('hl', i === j); }
          if(i === j){ s.halo.bringToFront(); s.line.bringToFront(); }
          s.bubble.setZIndexOffset(i === j ? 1000 : 0);
        });
        // The lit leg was raised above everything: put the waypoints back on top.
        dots.forEach(d=>d.bringToFront());
        declutter();
        const lit = i != null && segs[i] && segs[i].bubble.getElement();
        if(lit) lit.style.visibility = '';
        document.querySelectorAll('#root tr.leg').forEach((r,j)=>r.classList.toggle('is-hl', i === j));
      }
      function zoomTo(i){
        if(!segs[i]) return;
        map.flyToBounds(L.latLngBounds(segs[i].ll), {padding:[48,48], maxZoom:13,
          animate:!REDUCED, duration:.6});
      }
      segs.forEach((s,i)=>{
        [s.line, s.bubble].forEach(l=>{
          l.on('mouseover', ()=>highlight(i));
          l.on('mouseout', ()=>highlight(null));
          l.on('click', ()=>highlight(i));
        });
      });

      fit();
      paint(run);
      declutter();
      // Hosts size the iframe after the first paint: refit until the user
      // takes over the view.
      mapObserver = new ResizeObserver(()=>{
        if(!map) return;
        map.invalidateSize();
        if(!moved) fit();
        declutter();
      });
      mapObserver.observe(el);

      // The wheel scrolls the conversation, not the map: say how to zoom.
      const hint = el.querySelector('.wheelhint');
      let hintTimer = null;
      el.addEventListener('wheel', ()=>{
        hint.classList.add('on'); clearTimeout(hintTimer);
        hintTimer = setTimeout(()=>hint.classList.remove('on'), 1300);
      }, {passive:true});
      // Leaflet stops click propagation on its controls, so catch the
      // attribution link on the way down and open it through the host.
      el.addEventListener('click', e=>{
        const a = e.target.closest && e.target.closest('.leaflet-control-attribution a');
        if(a){ e.preventDefault(); openUrl(a.href); }
      }, true);

      mapApi = {paint, highlight, zoomTo, hasLegs: segs.length > 0};
    }

    // Hold the latest result so the handlers can resolve a row back to its
    // departure.
    let lastSc = null, lastRuns = [], sel = 0;
    const app = new App({ name: "OhMyWind Plan", version: "1.0.0" });

    function openUrl(url){
      // Sandboxed iframes silently drop window.open / target=_blank without
      // `allow-popups`. The MCP Apps spec exposes a host-mediated open via
      // app.openLink — works even inside a strict sandbox.
      if(!url) return;
      app.openLink({ url }).catch(err => {
        console.error('[ohmywind] openLink failed', err);
        // Last-resort: attempt window.open just in case (will silently fail
        // in a sandbox without allow-popups).
        try { window.open(url, '_blank', 'noopener'); } catch(e) {}
      });
    }

    // Selecting a departure keeps the map and its zoom, repaints the legs,
    // and swaps the summary, the detail and the link.
    function select(i){
      const r = lastRuns[i];
      if(!r) return;
      sel = i;
      const root = document.getElementById('root');
      root.querySelectorAll('tr.dep').forEach((row,j)=>row.setAttribute('aria-selected', String(j === i)));
      document.getElementById('ow-chosen').innerHTML = chosenBlock(r, true);
      document.getElementById('ow-detail').innerHTML = detailBlock(r, true);
      document.getElementById('ow-cta').setAttribute('href', r.url || "__WEB_BASE__/plan");
      if(mapApi) mapApi.paint(r);
      wireDetail();
    }

    function wireDetail(){
      const root = document.getElementById('root');
      const details = root.querySelector('details.detail');
      if(details) details.addEventListener('toggle', ()=>{ detailOpen = details.open; });
      const live = !!(mapApi && mapApi.hasLegs);
      root.classList.toggle('has-map', live);
      if(!live) return;
      // Row and leg point at each other: hover either to light both, click a
      // row to zoom on its leg.
      root.querySelectorAll('tr.leg').forEach((row,i)=>{
        row.tabIndex = 0;
        row.addEventListener('mouseenter', ()=>mapApi.highlight(i));
        row.addEventListener('mouseleave', ()=>mapApi.highlight(null));
        row.addEventListener('focus', ()=>mapApi.highlight(i));
        row.addEventListener('blur', ()=>mapApi.highlight(null));
        row.addEventListener('click', ()=>mapApi.zoomTo(i));
        row.addEventListener('keydown', e=>{
          if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); mapApi.zoomTo(i); }
        });
      });
    }

    function wireClicks(){
      const root = document.getElementById('root');
      // Departures list: click or Enter selects, arrows move through it, and
      // hovering a departure previews its colours on the map.
      const rows = [...root.querySelectorAll('tr.dep')];
      rows.forEach((tr,i)=>{
        tr.addEventListener('click', ()=>select(i));
        tr.addEventListener('keydown', e=>{
          if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(i); }
          else if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
            e.preventDefault();
            const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
            if(next){ next.focus(); select(Number(next.dataset.i)); }
          }
        });
        tr.addEventListener('mouseenter', ()=>{ if(mapApi) mapApi.paint(lastRuns[i]); });
        tr.addEventListener('mouseleave', ()=>{ if(mapApi) mapApi.paint(lastRuns[sel]); });
      });
      // The link reads its href on click: select() rewrites it.
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
      teardownMap();
      root.classList.remove('has-map');
      try {
        const multi = sc.mode === "multi_window";
        if(!multi && !sc.passage) return;
        lastRuns = runsOf(sc, result._meta);
        sel = 0;
        root.innerHTML = multi ? renderCompare(sc, lastRuns, sel) : renderSingle(sc, lastRuns[0]);
        wireClicks();
      } catch(e) {
        console.error('[ohmywind] render failed', e);
        lastRuns = [];
        const url = (sc.openwind_url || (sc.windows && sc.windows[0] && sc.windows[0].openwind_url) || "__WEB_BASE__/plan");
        root.innerHTML = `<div class="placeholder">
          Impossible d'afficher le plan ici.
          <br><a class="cta" href="${escapeHtml(url)}" rel="noopener">Ouvrir sur __WEB_HOST__ →</a>
        </div>`;
        wireClicks();
        return;
      }
      // The map sits on top of a plan that stands without it: if it fails,
      // drop it and keep the rest.
      try { buildMap(sc, lastRuns[sel]); }
      catch(e) {
        console.error('[ohmywind] route map failed', e);
        teardownMap();
        const wrap = root.querySelector('.mapwrap');
        if(wrap) wrap.remove();
      }
      wireDetail();
    }

    app.ontoolresult = render;
    try { await app.connect(); }
    catch (e) { console.error('[ohmywind] MCP App connect failed', e); }
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


_METHODOLOGY = """\
# OhMyWind calculation method

How `plan_passage` simulates a passage. Defaults below are what the server
uses unless overridden by tool parameters.

## Polar speed model

- 8 ORC-style archetypes (cruiser_20ft / cruiser_25ft / cruiser_30ft /
  cruiser_40ft / cruiser_50ft / racer_cruiser / catamaran_40ft /
  voile_aviron_16ft). voile_aviron_16ft is an open sail-and-oar dinghy of
  about 5 m (no cabin, centreboard); its polar is an estimate, pure sail,
  oars not modelled.
- Lookup is bilinear interpolation in (TWS, TWA), clamped at grid edges.
- TWA symmetric on [0, 180] only (no port/starboard distinction).

## Boat speed adjustments

- Efficiency factor (default 0.75): ORC polars are theoretical maxima;
  real cruising loses ~25% (sail trim, comfort margins, helm). Override
  per call: 0.85 racing, 0.65 loaded family cruising, 0.55 heavy seas /
  fouled hull.

- VMG / tacking correction: when route TWA is below the boat's optimal
  upwind angle, the simulator assumes the sailor tacks at the optimal VMG
  angle. The optimum is searched at or above the boat's minimum upwind
  angle (per-archetype, 42-50 deg; override via ``min_upwind_twa_deg`` on
  ``plan_passage``). Effective speed toward destination =
  polar(opt_TWA) * cos(opt_TWA - route_TWA). At dead upwind this reduces
  to polar(opt) * cos(opt) ~= polar / sqrt(2). At route_TWA=20 deg with
  opt=45 deg, the reduction is only cos(25 deg) ~= 0.91 (much less penalty).

- Wave derate (opt-in): max(0.5, 1 - 0.05 * Hs^1.75 * cos^2(TWA/2)).
  Off by default; sea state feeds the warning bar instead of slowing.

- Currents: SOG = STW + (current projected on bearing). Projection uses
  the oceanographic "going to" convention. Cascade source priority:
  MARC PREVIMER atlases (Ifremer, 250 m on critical Atlantic passes;
  700 m on the Manche / Bay of Biscay shelf; 2 km on the North-East
  Atlantic, confined to the waters PREVIMER validated: Bay of Biscay,
  Channel and Celtic Sea, never the North Sea); BSH Stroemungsvorhersagen
  (German Bight 926 m, Elbe 90 m, CC BY 4.0, analysed from a few days of
  forecasts, so S2 and N2 are inferred); Copernicus Marine regional
  models analysed over one year of hourly currents (NWS 1.5 km from the
  Channel to Shetland and Ireland, IBI 3 km for Iberia, Morocco and the
  Canaries, MED 4.2 km for the Mediterranean straits, confined to the
  Mediterranean, kept only where the tide reaches 0.2 kt, and never in
  the Strait of Gibraltar, where the
  tide alone would erase the Atlantic inflow) when the waypoint falls
  inside a covered emprise; otherwise Open-Meteo Marine (SMOC, 8 km
  global, tide plus general circulation, tides from FES2014). Norway and
  Iceland answer from SMOC: atlases exist for both, but they are out of
  the French-coast scope and the Norwegian one erased the coastal current.
  Priority between atlases is explicit in their metadata (rank, then
  resolution): a validated atlas (MARC, BSH) beats a Copernicus one. An
  open-sea atlas (rank 0 basin or 1 shelf: ATLNE, MANGA, BSH 926 m,
  Copernicus) answers only where its spring tidal current reaches 0.2 kt:
  below, the general current matters more than the tide, and the global
  model, which holds it, answers. Coastal and pass atlases keep every cell.
  Each leg surfaces a ``current_source`` field so the caller knows which
  product applied (e.g. ``marc_finis_250m``, ``bsh_db_926m``,
  ``cmems_nws_1500m``, ``openmeteo_smoc``, ``unknown``).
  MARC delivers harmonic prediction (tidal + 2008-2009 mean residual)
  and excludes short-term wind-driven surge, which Open-Meteo SMOC
  captures globally. Even the MARC atlases do not replace a SHOM tide
  atlas or paper chart for fine navigation in a narrow pass.

- Current confidence (``current_confidence`` per leg): qualitative tag
  derived from the data source. ``"high"`` on SHOM Atlas C2D and on any
  atlas at 1 km or finer (MARC 250 m and 700 m, BSH 90 m and 926 m);
  ``"medium"`` on atlases coarser than 1 km (MARC ATLNE 2 km, Copernicus
  1.5 to 4.2 km) and on Open-Meteo SMOC (8 km global product); ``None``
  when no current is given.

- Unknown current (``current_source: "unknown"``, speed and direction
  ``None``): we say we do not know rather than quote a number nobody
  should trust. Two cases. A documented zone where no source describes the
  real stream (the Rance above its tidal power plant, whose basin follows
  EDF's operating orders, not the tide); and a leg passing within 3 km of a
  known pass its source cannot see (a fine atlas measured blind there, or
  any coarse source at a pass no fine source serves). The leg's ETA is
  computed without current, and a ``currents.unknown`` notice names the
  places once per passage. Relay it: the sailor must use local tables or
  sailing directions there. A third case has no name: dead water in a
  coastal atlas (a river beyond the tidal model, such as the Seine above
  Tancarville, a basin, a lock), where the atlas holds a zero current; it
  is withheld the same way and raises ``currents.unknown_water`` with the
  number of legs.
  A ``currents.tidal_gap`` notice is raised when a leg whose current is
  not from a fine source crosses a zone where tidal streams are probably
  strong (a known race within 15 km, or more than 1.5 kt reconstructed
  with no fine atlas): the value is kept but probably too weak, and the
  notice names the places. Relay it.

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
  exceed 5 kt in narrow passes, so these become first-class signals.

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
fresh breeze even without contrary current, typical of a Mistral or
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
- No land or obstacle check: the polyline is timed exactly as drawn,
  so keeping it off the coast is the caller's job.
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

## Licence and trademark

The OhMyWind source code is licensed under the AGPL-3.0-or-later. Forks
and redistribution stay free; a modified instance served over the
network must publish its source. Two things the AGPL grant does not
cover: the name "OhMyWind", filed as a trademark at the INPI (the
French industrial property office), and the visual identity (logo,
icons), which stays under copyright. Forks are welcome under their own
name and icons. Policy:
https://github.com/qdonnars/ohmywind/blob/main/TRADEMARK.md
"""


def _window_with_link(
    report: Any, score: Any, waypoints_raw: list[dict[str, float]]
) -> dict[str, Any]:
    """A sweep row, plus the deep-link only this shell can build.

    Appended after the shared fields rather than woven in: the key order is
    what the goldens record, on both shells.
    """
    window = window_view(report, score)
    window["openwind_url"] = build_ohmywind_url(
        waypoints_raw, window["departure"], report.archetype
    )
    return window


def _route_view(points: list[Any]) -> list[dict[str, float]]:
    """The route as the model sent it, for the widget's map.

    The segments already carry coordinates, but they are the 10 nm
    subdivisions of the route; the map marks the model's own waypoints, the
    points a user would correct. Once per payload, never per sweep window:
    every window sails the same line.
    """
    return [{"lat": p.lat, "lon": p.lon} for p in points]


def _auto_forecast_models(start: datetime, end: datetime) -> list[str]:
    """The models for a point forecast when the caller names none.

    The first model that reaches the start of the window, so AROME wherever
    it can answer, and the first one that reaches its end when the window
    outruns it: a window from now to day 5 gets AROME's detail for two days
    and ICON-EU after, for one more request instead of three days of nulls.
    """
    first = auto_chain_from(start)[0]
    last = auto_chain_from(end)[0]
    return [first] if first == last else [first, last]


def _material_current_and_tide(points: Any) -> dict[str, Any]:
    """The current and the tide at a point, only where they matter.

    Same rule as everywhere else in OhMyWind: a current under 0.3 kt or a
    tidal range under 0.5 m is noise, which covers most of the
    Mediterranean. The values are those the composite adapter already put on
    the sea series (an atlas where one covers the point, Open-Meteo Marine
    otherwise): no extra request.
    """
    out: dict[str, Any] = {}
    currents = [p for p in points if p.current_speed_kn is not None]
    if currents and max(p.current_speed_kn for p in currents) >= CURRENT_RELEVANCE_THRESHOLD_KN:
        out["current"] = {
            "source": next((p.current_source for p in currents if p.current_source), None),
            "points": [
                {
                    "time": p.time.isoformat(),
                    "speed_kn": round(p.current_speed_kn, 2),
                    "direction_to_deg": None
                    if p.current_direction_to_deg is None
                    else round(p.current_direction_to_deg),
                }
                for p in currents
            ],
        }
    heights = [p for p in points if p.tide_height_m is not None]
    if heights:
        values = [p.tide_height_m for p in heights]
        if max(values) - min(values) >= TIDE_RANGE_RELEVANCE_THRESHOLD_M:
            out["tide"] = {
                "source": next((p.current_source for p in heights if p.current_source), None),
                "points": [
                    {"time": p.time.isoformat(), "height_m": round(p.tide_height_m, 2)}
                    for p in heights
                ],
            }
    return out


# A tidal-stream answer holds one row per step. 400 covers four days at 15
# minutes or a week at 30, more than any question about a pass needs, and
# keeps the reply short enough for the model to read whole.
MAX_TIDAL_STEPS = 400


def _runs(times: list[datetime], values: list[float | None], keep: Any) -> list[dict[str, Any]]:
    """The stretches where ``keep(value)`` holds, each with its strongest value."""
    out: list[dict[str, Any]] = []
    start: datetime | None = None
    last = peak = None
    for t, v in zip(times, values, strict=True):
        if v is not None and keep(v):
            if start is None:
                start, peak = t, v
            elif abs(v) > abs(peak):
                peak = v
            last = t
        elif start is not None:
            out.append(
                {"start": start.isoformat(), "end": last.isoformat(), "peak_kn": round(peak, 2)}
            )
            start = None
    if start is not None:
        out.append({"start": start.isoformat(), "end": last.isoformat(), "peak_kn": round(peak, 2)})
    return out


def _turning_points(
    times: list[datetime], values: list[float | None], highest: bool
) -> list[tuple[datetime, float]]:
    """Local maxima (``highest``) or minima of a sampled series.

    As exact as the step: at 30 minutes, a high water or a slack lands within
    a quarter of an hour of the time given.
    """
    out = []
    for i in range(1, len(values) - 1):
        a, b, c = values[i - 1], values[i], values[i + 1]
        if a is None or b is None or c is None:
            continue
        if (highest and b > a and b >= c) or (not highest and b < a and b <= c):
            out.append((times[i], b))
    return out


def _tidal_stream_view(
    adapter: MarineDataAdapter,
    lat: float,
    lon: float,
    times: list[datetime],
    heading_deg: float | None,
) -> dict[str, Any]:
    """The atlas prediction at a point, without a single weather request.

    Runs the cascade ``plan_passage`` applies leg by leg (unknown zones, SHOM
    up close, then the harmonic atlases) on a bare series of times, so a pass
    reads here exactly as it does in a plan. Outside every atlas the answer
    is "not covered", not the global model: that one costs a request, and
    ``get_marine_forecast`` already returns it where it matters.
    """
    link = build_explore_url(lat, lon)
    if not isinstance(adapter, CompositeMarineAdapter):
        return {
            "covered": False,
            "reason": "no tidal atlas is loaded on this server",
            "openwind_url": link,
        }
    bare = ForecastBundle(
        lat=lat,
        lon=lon,
        start=times[0],
        end=times[-1],
        sea=SeaSeries(
            points=tuple(
                SeaPoint(
                    time=t,
                    wave_height_m=None,
                    wave_period_s=None,
                    wave_direction_deg=None,
                    wind_wave_height_m=None,
                    swell_wave_height_m=None,
                )
                for t in times
            )
        ),
    )
    points = adapter.apply_atlases(bare, lat, lon).sea.points
    source = next((p.current_source for p in points if p.current_source), None)
    if source == UNKNOWN_CURRENT_SOURCE:
        return {
            "covered": False,
            "reason": "a documented zone where no source describes the real stream",
            "openwind_url": link,
        }
    if source is None:
        return {
            "covered": False,
            "reason": "no tidal atlas covers this point (most of the Mediterranean, the open "
            "sea); get_marine_forecast reports the global model's current where it matters",
            "openwind_url": link,
        }
    speeds = [p.current_speed_kn for p in points]
    dirs = [p.current_direction_to_deg for p in points]
    heights = [p.tide_height_m for p in points]
    if all(h is None for h in heights):
        # SHOM C2D primes on the current and carries no height; MARC still has
        # the height at that point, as the web's tide chart shows it.
        predicted = adapter.marc.predict_height_series(lat, lon, times)
        if predicted is not None:
            heights = [float(v) for v in predicted[0]]
    along = (
        [
            None if s is None or d is None else s * math.cos(math.radians(d - heading_deg))
            for s, d in zip(speeds, dirs, strict=True)
        ]
        if heading_deg is not None
        else None
    )
    rows = []
    for i, t in enumerate(times):
        row: dict[str, Any] = {"time": t.isoformat()}
        if speeds[i] is not None:
            row["speed_kn"] = round(speeds[i], 2)
            row["direction_to_deg"] = None if dirs[i] is None else round(dirs[i])
        if along is not None and along[i] is not None:
            row["along_kn"] = round(along[i], 2)
        if heights[i] is not None:
            row["height_m"] = round(heights[i], 2)
        rows.append(row)
    out: dict[str, Any] = {
        "lat": lat,
        "lon": lon,
        "covered": True,
        "source": source,
        "confidence": confidence_for_point(lat, lon, source),
        "heading_deg": heading_deg,
        "points": rows,
        "slack": [
            {"time": t.isoformat(), "speed_kn": round(v, 2)}
            for t, v in _turning_points(times, speeds, highest=False)
        ],
    }
    if any(h is not None for h in heights):
        out["high_waters"] = [
            {"time": t.isoformat(), "height_m": round(v, 2)}
            for t, v in _turning_points(times, heights, highest=True)
        ]
        out["low_waters"] = [
            {"time": t.isoformat(), "height_m": round(v, 2)}
            for t, v in _turning_points(times, heights, highest=False)
        ]
    if along is not None:
        out["favourable"] = _runs(times, along, lambda v: v >= CURRENT_RELEVANCE_THRESHOLD_KN)
        out["adverse"] = _runs(times, along, lambda v: v <= -CURRENT_RELEVANCE_THRESHOLD_KN)
    gap = unresolved_pass_at(lat, lon, source)
    if gap is not None:
        spring = f", published spring stream {gap.max_spring_kt:g} kt" if gap.max_spring_kt else ""
        out["warning"] = (
            f"{gap.zone}: the atlas does not resolve this pass{spring}; "
            "the real stream is stronger than these values"
        )
    if (
        source.startswith(("shom_c2d", "marc_"))
        and adapter.shom is not None
        and adapter.shom.ref_ports
    ):
        out["tide_coefficient"] = adapter.shom.tide_coefficient(times[0])
    out["openwind_url"] = link
    return out


def _legs_meta(reports: list[Any], windows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The legs of every listed sweep window, for the widget only.

    The geometry travels once: every window sails the same polyline, cut into
    the same segments. The rows follow ``windows``, after any target-ETA
    filter, matched on the departure each window reports.
    """
    first = reports[0].segments if reports else ()
    if not first:
        return None
    by_departure = {
        r.departure_time.isoformat(): [
            [
                s.end_time.isoformat(),
                round(s.tws_kn, 1),
                round(s.twa_deg),
                None if s.hs_m is None else round(s.hs_m, 2),
                round(s.boat_speed_kn, 2),
            ]
            for s in r.segments
        ]
        for r in reports
    }
    return {
        PLAN_UI_LEGS_META_KEY: {
            "geometry": [[first[0].start.lat, first[0].start.lon]]
            + [[s.end.lat, s.end.lon] for s in first],
            "fields": list(_LEG_FIELDS),
            "windows": [by_departure[w["departure"]] for w in windows],
        }
    }


def _tool_result(structured: dict[str, Any], meta: dict[str, Any] | None = None) -> CallToolResult:
    """The result FastMCP would build from ``structured``, plus a ``_meta``.

    A tool that returns a dict gets no ``_meta``: FastMCP builds the result
    itself. The text block is the same JSON the model has always read,
    indented as FastMCP indents it; the ``_meta`` goes to the widget.
    """
    return CallToolResult(
        content=[
            TextContent(type="text", text=json.dumps(structured, indent=2, ensure_ascii=False))
        ],
        structuredContent=structured,
        _meta=meta,
    )


def build_server(
    *,
    adapter: MarineDataAdapter | None = None,
) -> FastMCP:
    """Build a FastMCP server with all OhMyWind tools registered.

    Args:
        adapter: optional `MarineDataAdapter` used by data-fetching tools.
            Defaults to a ``CompositeMarineAdapter`` that wraps a fresh
            ``OpenMeteoAdapter`` and stacks two coastal-detail sources on
            top: the SHOM Atlas C2D registry under ``SHOM_C2D_DIR`` (when
            built and shipped), and the MARC PREVIMER atlases under
            ``MARC_ATLAS_DIR``. Either or both can be absent; the cascade
            degrades gracefully (SHOM > MARC > SMOC). Override the whole
            adapter in tests.

            A deployment that also serves the REST API passes the adapter
            the API built, so the two shells share one HTTP connection pool,
            one 30 min forecast cache and one copy of the atlases. Left to
            itself this factory loads its own registries, which is right for
            the stdio runner (the only process where it is alone) and was
            5 MB and 51 ms of pure duplication in the Space (audit M5).
    """
    # ``stateless_http=True`` disables the in-memory session table that
    # otherwise tracks an ``mcp-session-id`` per client across requests.
    # All OhMyWind tools are idempotent point-in-time fetches with no
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
        SERVER_NAME,
        stateless_http=True,
        json_response=True,
    )
    if adapter is not None:
        fetch_adapter: MarineDataAdapter = adapter
    else:
        marc_dir = os.environ.get("MARC_ATLAS_DIR")
        shom_dir = os.environ.get("SHOM_C2D_DIR")
        # ``compose_marine_adapter`` owns the "which tiers can this deployment
        # actually feed" rule. It used to be written out here and nowhere on
        # the REST side, which is how the same waypoint got SHOM currents over
        # MCP and 8 km SMOC over REST (audit M2).
        fetch_adapter = compose_marine_adapter(
            OpenMeteoAdapter(),
            MarcAtlasRegistry.from_directory(marc_dir) if marc_dir else None,
            ShomC2dRegistry.from_directory(shom_dir) if shom_dir else None,
        )

    @server.resource(
        PLAN_UI_RESOURCE_URI,
        name="OhMyWind plan widget",
        mime_type=PLAN_UI_MIME,
        meta={
            "ui": {
                "csp": {
                    # The SDK bundle and Leaflet from unpkg (same CDN as the
                    # official ext-apps examples), the map tiles from OSM. No
                    # `frameDomains` because the widget renders inline —
                    # Claude.ai 2026-05 doesn't honour `frameDomains` anyway,
                    # see comment on `_PLAN_WIDGET_HTML`.
                    "resourceDomains": PLAN_UI_RESOURCE_DOMAINS,
                }
            }
        },
    )
    def plan_widget_resource() -> str:
        """MCP Apps UI resource — renders the plan inline (no nested iframe).

        Receives the tool's ``structuredContent`` over postMessage (per the
        MCP Apps spec — the host pushes results to the iframe via a
        JSON-RPC dialect on the postMessage channel) and renders the figures,
        a map of the route from ``waypoints``, and the per-leg table. The map
        is optional: without Leaflet or tiles, the rest still renders.
        """
        # Substituted at serve time: the widget's fallback CTA has to name the
        # same environment the deep-links point at, or a plan rendered on dev
        # would hand the tester a link to production. The tile URL comes from
        # the constant the CSP is derived from, so the two cannot drift.
        return (
            _PLAN_WIDGET_HTML.replace("__WEB_BASE__", WEB_BASE)
            .replace("__WEB_HOST__", WEB_HOST)
            .replace("__TILE_URL__", OSM_TILE_URL)
            .replace("__LEGS_META_KEY__", PLAN_UI_LEGS_META_KEY)
        )

    # Every tool below spells out all four hints, including the two the spec
    # calls meaningful only when ``readOnlyHint`` is false. Redundant here by
    # the letter of the spec, but directory validators check for four booleans
    # rather than re-deriving the defaults, and a tool that omits them reads as
    # unannotated to them. Eight lines is cheaper than a rejected listing.
    @server.tool(
        annotations=ToolAnnotations(
            title="Calculation method",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def read_me() -> str:
        """Return OhMyWind's calculation methodology as Markdown.

        Call this when the user asks how passage timing, complexity, or
        boat speed are computed (e.g. "comment c'est calculé ?",
        "what assumptions does the model use?", "is tacking modelled?").

        The returned text covers: polar lookup, default efficiency 0.75,
        VMG / tacking correction, wave derate, single-pass timing,
        compare-windows mode semantics, Mediterranean simplifications
        (tides, currents), and what is intentionally NOT modelled in V1.
        """
        return _METHODOLOGY

    @server.tool(
        annotations=ToolAnnotations(
            title="Boat archetypes",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def list_boat_archetypes() -> list[dict[str, Any]]:
        """List the boat archetypes with descriptive metadata.

        The LLM (or user) maps a commercial model (e.g. "Sun Odyssey 32") to one
        of these archetypes from the metadata — there is no server-side mapping.
        ``voile_aviron_16ft`` is for open sail-and-oar dinghies only (no cabin,
        rowed as well as sailed); a small cabin cruiser maps to ``cruiser_20ft``.
        """
        return [_archetype_summary(p) for p in list_archetypes()]

    @server.tool(
        annotations=ToolAnnotations(
            title="Marine forecast",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        ),
    )
    async def get_marine_forecast(
        lat: float,
        lon: float,
        start: str,
        end: str,
        models: list[str] | None = None,
    ) -> dict[str, Any]:
        """Wind, sea, and where it matters current and tide, at one point.

        For the questions about a place rather than a passage: how hard it
        blows at Groix this afternoon, when the thermal breeze fills in, when
        the mistral eases, whether the models agree, what the swell does at a
        harbour entrance tonight.

        Args:
            lat: latitude in degrees.
            lon: longitude in degrees.
            start: ISO-8601 datetime, timezone-aware (e.g. "2026-05-01T06:00:00+00:00").
            end: ISO-8601 datetime, timezone-aware.
            models: optional list of model names. Leave it unset for the
                automatic choice: AROME (1.3 km) wherever it reaches the
                window, and the next model that reaches its end when the
                window runs past two days. Name several models (e.g.
                ``["meteofrance_arome_france", "icon_eu", "ecmwf_ifs025"]``)
                only when the user asks whether the models agree: each one
                costs a request.

        Returns hourly ``wind`` per model (speed, direction it comes from,
        gusts, in knots), ``sea`` (wave height, period, direction), and, only
        where they are material, ``current`` (speed in knots, direction it
        flows to, from a tidal atlas where one covers the point) and ``tide``
        (height around mean sea level: read the range and the times of high
        and low water from it, not a depth over chart datum). Also
        ``openwind_url``, the OhMyWind map centred on the point.

        Answer in a sentence first (the user is often in a car or at the bar),
        then give the few numbers that back it, as a short table or a small
        chart if your interface draws one. No widget comes with this tool:
        the presentation is yours. Offer ``openwind_url`` as "voir sur la
        carte". This is a forecast: never present it as a measurement of
        what is blowing right now.

        Pass a point at sea. Over land Open-Meteo still returns wind, but
        every sea value comes back null, so the ``sea`` array is present and
        empty of information rather than absent.

        Note: the first request after inactivity may incur ~5s of cold-start.

        """
        validate_point(lat, lon)
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        if not models or models == [AUTO_MODEL]:
            models = _auto_forecast_models(start_dt, end_dt)
        bundle = await fetch_adapter.fetch(lat, lon, start_dt, end_dt, models=models)
        return (
            {
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
            | _material_current_and_tide(bundle.sea.points)
            | {
                "openwind_url": build_explore_url(lat, lon),
            }
        )

    @server.tool(
        annotations=ToolAnnotations(
            title="Tidal stream at a point",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def get_tidal_stream(
        lat: float,
        lon: float,
        start: str,
        end: str,
        heading_deg: float | None = None,
        step_minutes: int = 30,
    ) -> dict[str, Any]:
        """The tidal stream and the tide at one point, from the tidal atlases alone.

        For the questions about a pass or a harbour entrance: when to be at
        the Raz de Sein to carry the stream, when the Fromveur turns, how
        hard it runs at Port-Navalo tomorrow, when high water is at Chausey.
        Costs no weather request: harmonic predictions from the atlases this
        server ships (SHOM, MARC and others), the same ones ``plan_passage``
        applies leg by leg.

        Args:
            lat: latitude in degrees, at sea, in the pass itself.
            lon: longitude in degrees.
            start: ISO-8601 datetime, timezone-aware.
            end: ISO-8601 datetime, timezone-aware. At most 400 steps.
            heading_deg: optional course through the point (true degrees,
                the direction you head to). With it, each step gets
                ``along_kn`` (positive: the stream carries you, negative: it
                stems you) and the answer lists the ``favourable`` and
                ``adverse`` windows.
            step_minutes: 5 to 180, default 30.

        Returns ``covered``, ``source``, ``confidence``, ``points`` (time,
        ``speed_kn``, ``direction_to_deg`` it flows to, ``height_m`` around
        mean sea level, ``along_kn``), ``slack`` (the weakest moments of the
        stream), ``high_waters`` / ``low_waters``, ``favourable`` /
        ``adverse`` when a heading is given, ``tide_coefficient`` (French
        national coefficient, Brest, on French atlases), a ``warning`` when
        the atlas does not resolve the pass, and ``openwind_url``.

        Outside every atlas (most of the Mediterranean, the open sea)
        ``covered`` is false: say so, and use ``get_marine_forecast``, which
        returns the global model's current where it matters.

        Astronomical tide only: no surge, no wind-driven current. The windows
        are facts about the stream, not a recommendation: weigh them against
        the wind (``get_marine_forecast``) and the whole passage
        (``plan_passage``). Present the answer yourself, the time to be at the
        pass in one sentence and the few times that back it: no widget comes
        with this tool.
        """
        validate_point(lat, lon)
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        if start_dt.tzinfo is None or end_dt.tzinfo is None:
            raise ValueError("start and end must be timezone-aware")
        if end_dt <= start_dt:
            raise ValueError("end must be after start")
        if not 5 <= step_minutes <= 180:
            raise ValueError(f"step_minutes must be in [5, 180], got {step_minutes}")
        step = timedelta(minutes=step_minutes)
        n_steps = int((end_dt - start_dt) / step) + 1
        if n_steps > MAX_TIDAL_STEPS:
            raise ValueError(
                f"requested {n_steps} steps, at most {MAX_TIDAL_STEPS}: "
                "shorten the window or widen step_minutes"
            )
        times = [start_dt + step * i for i in range(n_steps)]
        heading = None if heading_deg is None else heading_deg % 360
        return _tidal_stream_view(fetch_adapter, lat, lon, times, heading)

    @server.tool(
        annotations=ToolAnnotations(
            title="Plan a passage",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        ),
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
        motor_threshold_kn: float | None = None,
        motor_speed_kn: float | None = None,
        min_upwind_twa_deg: float | None = None,
    ) -> Annotated[CallToolResult, dict[str, Any]]:
        """Plan an A→B passage. Compare departure windows by default; pin a
        single departure only when the user gives an explicit time.

        ## Tool routing: read this first

        Before calling, classify the user's question:

        1. **Pure weather lookup at a point** ("y aura-t-il du vent à Cassis
           samedi à 14h ?", "quelles vagues dimanche au cap Sicié ?"): call
           ``get_marine_forecast`` and answer in text. Do NOT call
           ``plan_passage``: there's no route to plan.

        2. **Trajet question with a flexible date** ("Marseille → Porquerolles
           ce week-end", "demain ou après-demain", "dans les prochains jours"):
           call ``plan_passage`` in **compare-windows mode**, passing
           ``latest_departure`` (e.g. earliest+48h) and ``sweep_interval_hours``
           (3 or 6 typically) so the user sees several departure scenarios
           side-by-side. Then pick 2-3 good ones and let the user choose.
           This is the **default** for trajet planning: same API cost as a
           single passage thanks to cache prewarm, much more value.

        3. **Trajet with a precise hour pinned by the user** ("je pars demain
           à 8h", "départ Saturday 9am"): call ``plan_passage`` in single
           mode (no ``latest_departure``). Used for the final "show me the
           detailed plan for THIS departure" view, often after step 2.

        4. **Methodology question** ("comment c'est calculé ?",
           "quelle efficacité par défaut ?"): call ``read_me``.

        Rule of thumb: if the user does NOT give an exact hour, prefer
        compare-windows. The widget renders one of the windows by default
        and the chat lets the user pick another.

        ## Waypoints must stay in the water

        This server does no land check. It samples wind and sea along the
        polyline you pass, then reports distance, ETA and complexity for that
        polyline, whatever it crosses. A leg drawn through a peninsula raises
        no error: it returns a passage that is too short, too fast, and scored
        on conditions the boat would never meet.

        So the route is yours to draw. Between every consecutive pair of
        waypoints the straight line must stay at sea. Add intermediate
        waypoints to round anything the direct line would cut: headlands,
        peninsulas, islands, shoals.

        - Toulon to Saint-Tropez: the direct line crosses the Massif des
          Maures. Pass south of the presqu'île de Giens, then round cap Bénat
          and cap Camarat before turning north into the gulf.
        - Brest to Douarnenez: the direct line crosses the presqu'île de
          Crozon. Exit the goulet, round the cap de la Chèvre, then head east
          into the bay.

        Keep about 1 NM of clearance off headlands, more with onshore wind or
        swell, and do not shave the inside of islands. Extra waypoints are
        close to free: the cap is 50, and sampling cost follows
        ``segment_length_nm`` and total distance, not the waypoint count. When
        in doubt, add the waypoint.

        A waypoint that lands ashore has a second effect. Open-Meteo returns
        no sea state over land, so those samples carry a null wave height and
        the complexity score silently falls back to wind only, dropping the
        axis that would have flagged a rough passage.

        Name the capes you routed around in your reply ("passage au large du
        cap Bénat"), so the user can correct a leg you drew wrong.

        ## Returned payload

        Single mode:

        - ``passage``: per-segment timing report (distance_nm, duration_h,
          model used, segments[] with TWS/TWA/boat_speed/Hs, warnings).
        - ``complexity``: 1-5 difficulty score with wind/sea breakdown and a
          human-readable rationale.
        - ``openwind_url``: deep-link to ohmywind.fr/plan that renders the
          same passage in the standalone web app.
        - ``waypoints``: the route as you sent it, which the widget draws on
          a map.
        - ``disclaimer``: usage warning to relay (see below).

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
        - ``notices`` / ``meta_notices``: the same warnings as codes with
          their values (``{"code": "sweep.skipped_windows", "params": …}``),
          for a client that says them in another language. Read the French
          ``message`` and ignore these.
        - ``waypoints``: the route as you sent it, once for all windows.
        - ``disclaimer``: usage warning to relay (see below).

        ## ALWAYS relay the disclaimer

        This tool returns an ETA and a difficulty score the user may act on to
        decide whether to put to sea. Carry the ``disclaimer`` field into your
        reply, once, in the user's language, phrased naturally rather than
        quoted verbatim. Put it after the numbers, not before: it qualifies
        them, it does not replace them. Do not drop it because the plan looks
        easy, and do not repeat it on every follow-up turn about the same
        passage.

        ## How it renders

        On hosts that support MCP Apps (Claude, Claude Desktop, ChatGPT, VS
        Code Copilot, Goose, Postman, MCPJam), the response is automatically
        accompanied by an interactive widget served via the
        ``ui://openwind/plan-passage`` resource declared on this tool's
        ``_meta``. In compare-windows mode it lists the departures; the one
        the user selects (the earliest at first) drives a map of the route
        you drew, coloured by its wind, and its per-leg detail. In single
        mode it shows the figures, the map and the per-leg detail. The user
        sees your waypoints on that map, one more reason to keep every leg at
        sea.

        On hosts without MCP Apps support (Cursor, Le Chat, terminal), present
        a short text summary of the result (route, ETA, complexity, warnings)
        and offer ``openwind_url`` as the "View full plan →" link.

        ## ALWAYS include the openwind_url(s) in your text reply

        Even when the widget renders inline, the user wants the link spelled
        out so they can open the full app, share it, or bookmark it. Treat
        this as a hard requirement, not a fallback:

        - **Single mode**: end your reply with a Markdown link built from the
          ``openwind_url`` field, e.g. ``[Voir le plan détaillé →](<openwind_url>)``.
          Always use that value verbatim, never a URL you compose yourself: it
          points at the environment this server is configured for, which is not
          always the production site.
        - **Compare-windows mode**: list 2-4 of the most relevant windows
          and give each its own link, e.g.
          ``- Sam 2 mai 09h · 11h12 · ⚡2/5 · [voir →](url)``.
          The widget lets the user inspect any window, but it does not
          rank them: your picks and their links still belong in the reply.

        Phrase the link with intent ("voir le plan détaillé", "ouvrir cette
        fenêtre dans l'app"), not just a bare URL: the user should know
        what clicking does.

        ## Args

            waypoints: list of ``{"lat": ..., "lon": ...}`` dicts, 2 to 50.
                Used exactly as drawn. Read "Waypoints must stay in the
                water" above before building it.
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
                route: pass it if you have a sea-state estimate from
                ``get_marine_forecast`` and want it factored into the score.
                Defaults to wind-only scoring.
            motor_threshold_kn: optional sail-speed floor (knots) under which
                the simulator switches to engine power. Must be paired with
                ``motor_speed_kn`` (either alone is ignored). Typical value
                2 kn: sailors fire up the engine rather than crawl in light
                wind. Leave unset for 100% sail. Range (0, 10].
            motor_speed_kn: optional speed under engine (knots) applied to
                segments where the sail estimate falls under
                ``motor_threshold_kn``. Typical 5-6 kn for a cruising boat.
                Range (0, 12].
            min_upwind_twa_deg: optional minimum sailable TWA (degrees)
                overriding the archetype's own value (42-50 deg depending on
                the boat). Pass it when you know the boat points better or
                worse than the archetype suggests. Range [25, 70].

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

        """
        # Same guards, same wording as the REST layer. FastMCP turns any
        # exception raised in a tool into an isError result carrying str(exc),
        # so the LLM reads the identical message a browser client would get.
        pts = parse_waypoints(waypoints)

        # Resolved up front so an unknown archetype reads as
        # "unknown archetype: 'foo'" (REST's wording) rather than the bare
        # KeyError string "'foo'" that get_polar surfaces from deep inside
        # the engine.
        try:
            get_polar(archetype)
        except KeyError as exc:
            raise ValueError(f"unknown archetype: {exc}") from exc

        if min_upwind_twa_deg is not None and not 25.0 <= min_upwind_twa_deg <= 70.0:
            raise ValueError(f"min_upwind_twa_deg must be in [25, 70], got {min_upwind_twa_deg}")

        dep = datetime.fromisoformat(departure)

        # Polar override: clone the archetype polar with the caller's knobs.
        # Motor requires BOTH values (same rule as ``_apply_motor``) so a
        # half-filled call never silently changes the result.
        polar_changes: dict[str, float] = {}
        if motor_threshold_kn is not None and motor_speed_kn is not None:
            polar_changes["motor_threshold_kn"] = float(motor_threshold_kn)
            polar_changes["motor_speed_kn"] = float(motor_speed_kn)
        if min_upwind_twa_deg is not None:
            polar_changes["min_upwind_twa_deg"] = float(min_upwind_twa_deg)
        polar_override: BoatPolar | None = (
            replace(get_polar(archetype), **polar_changes) if polar_changes else None
        )

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
                polar_override=polar_override,
            )
            windows = [
                _window_with_link(r, _score_complexity(r, max_hs_m=max_hs_m), waypoints)
                for r in reports
            ]

            meta_notices: list[Notice] = []
            # The engine widens the interval when windows x segments would blow
            # the simulation budget, so report what the sweep actually did
            # rather than what was asked for.
            effective_interval = sweep_interval_hours
            if reports:
                effective_interval, _ = resolve_sweep_interval(
                    (latest_dep.astimezone(UTC) - dep.astimezone(UTC)).total_seconds() / 3600,
                    sweep_interval_hours,
                    len(reports[0].segments),
                )
                if effective_interval != sweep_interval_hours:
                    meta_notices.append(
                        widened_interval_warning(
                            effective_interval, sweep_interval_hours, len(reports[0].segments)
                        )
                    )
            if target_eta is not None:
                windows, unmatched = filter_windows_by_target_eta(
                    windows, datetime.fromisoformat(target_eta), target_eta
                )
                if unmatched is not None:
                    meta_notices.append(unmatched)

            return _tool_result(
                sweep_view(
                    earliest=dep,
                    latest=latest_dep,
                    interval_hours=effective_interval,
                    windows=windows,
                    meta_notices=meta_notices,
                )
                | {"waypoints": _route_view(pts), "disclaimer": PASSAGE_DISCLAIMER},
                _legs_meta(reports, windows),
            )

        # --- SINGLE MODE ---
        report = await _estimate_passage(
            pts,
            dep,
            archetype,
            efficiency=efficiency,
            segment_length_nm=segment_length_nm,
            adapter=fetch_adapter,
            model=model,
            polar_override=polar_override,
        )
        score = _score_complexity(report, max_hs_m=max_hs_m)

        return _tool_result(
            passage_envelope(report, score)
            | {
                "openwind_url": build_ohmywind_url(waypoints, departure, archetype),
                "waypoints": _route_view(pts),
                "disclaimer": PASSAGE_DISCLAIMER,
            }
        )

    return server
