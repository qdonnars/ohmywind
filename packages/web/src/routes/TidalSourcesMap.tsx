// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The tidal-sources map of /methodologie, in four colours: where the tidal
 * current exceeds 1.5 kt, is the app served by a tidal source, and if not,
 * is an open source identified, is the known data closed, or is nothing
 * known. Known passes carry the same colours. Layers come from static files
 * under ``public/methodologie/tidal/`` (written by
 * ``scripts/build_tidal_world_map.py --web-dir``); a click asks the server
 * which source it would use at that point, through the same endpoint the
 * plan uses, so the card never disagrees with the app. The source registry
 * sits under the map, folded: each row can draw its extent.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE } from "../api/config";
import { formatGridSize } from "../domain/currentSource";
import {
  SMOC_SOURCE_ID,
  ZONE_STATUSES,
  cascadeAt,
  classifyAnswer,
  labelNamesAtlas,
  esc,
  nearestPass,
  precisionClass,
  sourcesAt,
  type CoverageAtlas,
  type PassProperties,
  type PrecisionClass,
  type SourceRole,
  type SourceAnswer,
  type ZoneProperties,
  type ZoneStatus,
} from "../domain/tidalMapGeo";
import {
  CALM_COLOR,
  RasterGrid,
  isDeadCoastal,
  isWeakCoarse,
  rampColor,
  rampGradient,
  type RasterManifest,
} from "../domain/tidalRaster";
import { useT } from "../i18n";
import { addBasemap } from "../utils/basemapLayer";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { sourceFreshness, type UpdateCadence } from "../domain/sourceHealth";
import unknownZones from "../domain/unknownZones.json";

const DATA_BASE = `${import.meta.env.BASE_URL}methodologie/tidal/`;
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;
const EXPLAIN_URL = `${API_BASE}/api/v1/marine/marc/explain`;
const COVERAGE_URL = `${API_BASE}/api/v1/marine/marc/coverage`;
const CONTACT = "contact@ohmywind.fr";

type PassFC = FeatureCollection<Point, PassProperties>;
type StatusFC = FeatureCollection<Geometry, ZoneProperties>;
interface SourceProperties {
  id: string;
  name: string;
  provider: string;
  status: string;
  kind: string;
  resolution_m: number | null;
  access: string;
  licence: string;
  licence_url: string;
  licence_read_at: string;
  /** How we download or query it, technically. */
  acquisition?: string;
  /** How we plan to keep our copy current. */
  update_plan?: string;
  /** keyless, free_account, api_key, sftp_account, on_request, paid, none. */
  access_kind?: string;
  /** auto, auto_secret, manual, none: can a scheduled job fetch it alone. */
  automation?: string;
  /** open, non_commercial, paid, other: the licence in one word. */
  licence_class?: string;
  /** How often our copy is meant to be refreshed. */
  update_cadence?: UpdateCadence;
  /** Kept in the registry file (it feeds the map) but not listed in the table:
      validation references, redundant or non-tidal products. */
  hide_in_table?: boolean;
  /** Atlas names (or the source short ``shom``) the server would list in
      its coverage when it serves this source. */
  atlases?: string[];
}
type SourceFC = FeatureCollection<Geometry, SourceProperties>;

/** What the server serves right now: the names of its atlases and the
    sources of its point sets, from the coverage endpoint. ``null`` when the
    server could not be asked, then the registry's own status stands. */
interface Served {
  /** Atlas names and source shorts the server lists. */
  names: Set<string>;
  /** The atlases themselves, with their extents, for the card's cascade. */
  atlases: CoverageAtlas[];
}

async function loadServed(): Promise<Served | null> {
  try {
    // Revalidated on every visit: the server sends a day of browser cache,
    // and the registry's data status must not show yesterday's atlases. A
    // few kilobytes.
    const resp = await fetch(COVERAGE_URL, { cache: "no-cache" });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as { atlases?: CoverageAtlas[] };
    const names = new Set<string>();
    for (const a of payload.atlases ?? []) {
      names.add(a.name);
      if (a.source) names.add(a.source);
    }
    return { names, atlases: payload.atlases ?? [] };
  } catch {
    return null;
  }
}

/** The status to badge: ``current`` when the server lists one of the
    source's atlases, otherwise the registry's licence status. */
function liveStatus(p: SourceProperties, served: Set<string> | null): string {
  if (served && p.atlases?.some((a) => served.has(a))) return "current";
  if (served && p.status === "current" && p.atlases?.length) return "ok";
  return p.status;
}

interface Layers {
  passes: PassFC;
  status: StatusFC;
  objective: FeatureCollection;
  sources: SourceFC;
  /** Water a tidal model covers and finds without a tide worth planning
      around (under 0.2 kt, the Baltic under 0.5 kt): drawn in its own colour
      so it does not read as missing data. */
  negligible: FeatureCollection;
}

const STATUS_COLOR: Record<ZoneStatus, string> = {
  calm: "#cfe8d6",
  covered: "#2a9d5c",
  target: "#f28c28",
  blocked: "#7b3fd4",
  unknown: "#d43f3a",
};
const OBJECTIVE_COLOR = "#1f2937";
/** Covered water where the tide is not significant. */
const NEGLIGIBLE_COLOR = "#3b82c4";
// The sea of the basemap: Copernicus's general currents, wherever no tidal
// atlas answers (no atlas there, or a tide under 0.2 kt).
const GENERAL_SEA_COLOR = "#a9c6e3";
// Documented zones where the current is withheld (domain/unknownCurrent):
// greyed over the rasters, since the app shows no value there.
const UNKNOWN_ZONE_COLOR = "#6b7280";
/** A registry status drawn in the colour of the zone status it would produce. */
const SOURCE_COLOR: Record<string, string> = {
  current: STATUS_COLOR.covered,
  ok: STATUS_COLOR.target,
  clarify: STATUS_COLOR.blocked,
  blocked: STATUS_COLOR.blocked,
  no_currents: "#8a8a84",
};
const SOURCE_ORDER = ["current", "ok", "clarify", "blocked", "no_currents"];
/** A source's role at a clicked point, in the registry's colours: green for
    the one the app uses, blue for the general current, grey for an
    integrated source passed over, the licence colours for the missing ones. */
const ROLE_COLOR: Record<SourceRole, string> = {
  used: STATUS_COLOR.covered,
  fallback: NEGLIGIBLE_COLOR,
  passed: "#8a8a84",
  ok: SOURCE_COLOR.ok,
  clarify: SOURCE_COLOR.clarify,
  blocked: SOURCE_COLOR.blocked,
};
/** "Copernicus Marine MED" for "Copernicus Marine MED (MEDSEA_...)": the
    card keeps the name, the registry row keeps the product code. */
const shortSourceName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "");
/** The precision of the server's answer, in its own neutral ramp so it is
    never read as one of the four zone statuses. */
const PRECISION_COLOR: Record<PrecisionClass, string> = {
  fine: "#1e40af",
  medium: "#2563eb",
  coarse: "#475569",
  global: "#64748b",
};

async function loadJson<T>(name: string): Promise<T> {
  const resp = await fetch(`${DATA_BASE}${name}`);
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/** The status layer carries everything the card needs about the tide: the
    covered bands (0.5 to 5 kt), the calm water, the uncovered strong zones.
    The masks themselves stay on the docs page; the page loads 3 MB less. */
async function loadLayers(): Promise<Layers> {
  const [passes, status, objective, sources, negligible] = await Promise.all([
    loadJson<PassFC>("gazetteer.geojson"),
    loadJson<StatusFC>("status.geojson"),
    loadJson<FeatureCollection>("objective.geojson"),
    loadJson<SourceFC>("sources.geojson"),
    // Optional: an older deploy without the file keeps working.
    loadJson<FeatureCollection>("negligible.geojson").catch(() => ({ type: "FeatureCollection", features: [] }) as FeatureCollection),
  ]);
  return { passes, status, objective, sources, negligible };
}

/** The maximum-current rasters, decoded: each PNG is drawn through a canvas
    into an image overlay (calm colour under 0.5 kt, the ramp above, nothing
    where the atlas has no cell, nor where the server does not use it: an
    open-sea atlas under 0.2 kt, dead water of a coastal one) and kept for
    the value under a click. Where nothing is drawn the sea shows through,
    in the general-currents colour. Best effort: a missing manifest or a
    browser without canvas leaves the map without them. */
/** ``/api/v1/marine/marc/explain``: the server's audit of one point. */
type ExplainAtlas = {
  atlas: string;
  label: string;
  rank: number;
  resolution_m: number;
  decision: "used" | "dead_water" | "unknown_zone" | "lower_priority" | "weak_tide" | "excluded" | "no_cell" | "outside_validity";
  max_tide_kt?: number;
  box?: string;
};
type Explain = {
  answer: {
    kind: "land" | "unknown" | "shom" | "atlas" | "global";
    source?: string;
    zone?: string | null;
    reason?: string;
    resolution_m?: number;
    max_tide_kt?: number | null;
  };
  atlases: ExplainAtlas[];
  shom?: { covers: boolean; nearest_km: number | null; max_km: number };
  plan: {
    blind_pass?: { name: string; km: number; max_spring_kt: number | null };
    tidal_gap?: { zone: string; kind: string; km: number };
  };
};

/** One atlas the server says holds the point and passes on it. */
type DeclinedAtlas = {
  atlas: string;
  label: string;
  resolution_m: number;
  reason: "weak_tide" | "excluded" | "no_cell";
  max_tide_kt?: number;
  box?: string;
};

type RasterOverlay = { url: string; bounds: L.LatLngBoundsExpression; width: number };

async function loadRasters(): Promise<{ grids: RasterGrid[]; overlays: RasterOverlay[] }> {
  const manifest = await loadJson<RasterManifest>("raster/rasters.json");
  const grids: RasterGrid[] = [];
  const overlays: RasterOverlay[] = [];
  for (const entry of manifest.rasters) {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(entry.file));
    });
    img.src = `${DATA_BASE}${entry.file}`;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const values = new Uint8Array(canvas.width * canvas.height);
    const out = ctx.createImageData(canvas.width, canvas.height);
    const cache = new Map<number, [number, number, number]>();
    for (let i = 0; i < values.length; i++) {
      const v = pixels.data[i * 4];
      values[i] = v;
      if (v === 0) continue;
      const kt = (v - 1) / entry.scale;
      // Dead water of a coastal atlas: withheld by the server, drawn as nothing.
      if (isDeadCoastal(entry, kt)) continue;
      // A tide too weak to answer: the general current does, and the sea
      // under the rasters is already its colour.
      if (isWeakCoarse(entry, kt)) continue;
      let rgb = cache.get(v);
      if (!rgb) {
        rgb = kt >= 0.5 ? hexToRgb(rampColor(kt)) : hexToRgb(CALM_COLOR);
        cache.set(v, rgb);
      }
      out.data[i * 4] = rgb[0];
      out.data[i * 4 + 1] = rgb[1];
      out.data[i * 4 + 2] = rgb[2];
      out.data[i * 4 + 3] = 255;
    }
    grids.push(new RasterGrid(entry, canvas.width, canvas.height, values));
    ctx.putImageData(out, 0, 0);
    overlays.push({ url: canvas.toDataURL("image/png"), bounds: entry.bounds, width: canvas.width });
  }
  return { grids, overlays };
}

function hexToRgb(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const passRadius = (p: PassProperties) => 3 + Math.min(7, (p.max_spring_kt ?? 1) * 0.6);
const sortedSources = (fc: SourceFC, served: Set<string> | null = null): SourceProperties[] =>
  fc.features
    .map((f) => f.properties)
    .sort(
      (a, b) =>
        SOURCE_ORDER.indexOf(liveStatus(a, served)) - SOURCE_ORDER.indexOf(liveStatus(b, served)) || a.name.localeCompare(b.name),
    );
/** Popup options sized from the map: on a phone the card must leave the
    zoom control clear and stay shorter than the map, scrolling inside if
    a long registry entry needs it. */
const popupOptions = (map: L.Map): L.PopupOptions => {
  const { x, y } = map.getSize();
  return {
    className: "methodo-map-popup",
    maxWidth: Math.max(220, Math.min(360, x - 72)),
    maxHeight: Math.max(200, Math.min(420, y - 48)),
    autoPanPaddingTopLeft: L.point(56, 12),
    autoPanPaddingBottomRight: L.point(12, 12),
  };
};

type Translate = ReturnType<typeof useT>["t"];
const badge = (color: string, text: string) => `<span class="methodo-map-badge" style="background:${color}">${esc(text)}</span>`;
const row = (k: string, v: string | null | undefined) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : "");

function sourcePopup(t: Translate, p: SourceProperties, served: Set<string> | null): string {
  const status = liveStatus(p, served);
  return (
    `<h3 class="methodo-map-popup-title">${esc(p.name)}</h3>` +
    badge(SOURCE_COLOR[status] ?? "#999", t(`config.methodo.tidal.source.status.${status}` as Parameters<typeof t>[0])) +
    `<dl class="methodo-map-popup-grid">` +
    row(t("config.methodo.tidal.sources.provider"), esc(p.provider)) +
    row(t("config.methodo.tidal.source.resolution"), p.resolution_m ? `${esc(p.resolution_m)} m` : null) +
    row(t("config.methodo.tidal.source.access"), esc(p.access)) +
    row(
      t("config.methodo.tidal.source.licence"),
      `<a href="${esc(p.licence_url)}" target="_blank" rel="noopener">${esc(p.licence)}</a> <small>(${esc(t("config.methodo.tidal.source.readAt", { date: p.licence_read_at }))})</small>`,
    ) +
    `</dl>`
  );
}

export function TidalSourcesMap() {
  const { t, locale } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataRef = useRef<Layers | null>(null);
  const gridsRef = useRef<RasterGrid[]>([]);
  const sourceLayersRef = useRef<Map<string, L.Layer>>(new Map());
  // A source name clicked in a card: its registry row, highlighted. Read
  // through a ref by the map's click listener, set up once.
  const [focusedSource, setFocusedSource] = useState<string | null>(null);
  const focusSourceRef = useRef<((id: string) => void) | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<SourceProperties[]>([]);
  const [served, setServed] = useState<Set<string> | null>(null);
  const [servedAtlases, setServedAtlases] = useState<CoverageAtlas[]>([]);
  // Beside the map on a wide screen, the registry starts open: ticking a row
  // and seeing its extent is the point of the layout. Below the map on a
  // phone it starts folded, as before.
  const [registryOpen, setRegistryOpen] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1100px)").matches,
  );
  const servedRef = useRef<Served | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const statusText = (s: ZoneStatus | null) => t(`config.methodo.tidal.status.${s ?? "none"}`);
  const fmtKt = (kt: number) => kt.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Popup text for a known pass; reads the dictionary at click time so a
  // language switch after mount still lands in the right words.
  function passPopup(p: PassProperties): string {
    const coverage = p.best_source
      ? `${esc(p.best_source)} : ${esc(t(`config.methodo.tidal.precision.${p.coverage_class}`))}`
      : esc(t("config.methodo.tidal.pass.coverageNone"));
    const candidates = p.candidates?.length ? p.candidates.map(esc).join("<br>") : esc(t("config.methodo.tidal.popup.none"));
    return (
      `<h3 class="methodo-map-popup-title">${esc(p.name)}</h3>` +
      badge(STATUS_COLOR[p.status] ?? STATUS_COLOR.unknown, statusText(p.status)) +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.pass.published"), p.max_spring_text ? `${esc(p.max_spring_text)} kt` : null) +
      row(t("config.methodo.tidal.pass.confidence"), esc(p.confidence)) +
      row(t("config.methodo.tidal.pass.coverage"), coverage) +
      row(t("config.methodo.tidal.popup.candidates"), candidates) +
      row(t("config.methodo.tidal.popup.objective"), esc(t(p.in_objective ? "config.methodo.tidal.popup.yes" : "config.methodo.tidal.popup.no"))) +
      row(t("config.methodo.tidal.pass.reference"), p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(p.source_url.replace(/^https?:\/\//, "").slice(0, 40))}</a>` : null) +
      `</dl>`
    );
  }

  // The card from the overlay alone, for a server without the explain
  // route: its answer for the point, the cascade rebuilt in the browser.
  async function legacyClickPopup(lat: number, lon: number): Promise<string> {
    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3600_000);
    let answerHtml: string;
    let precision: PrecisionClass | null = null;
    let answerLabel = "openmeteo_smoc";
    let unknownAnswer: SourceAnswer["unknown"] | null = null;
    // The atlases the server says hold the point and pass on it, and why.
    let declinedList: DeclinedAtlas[] = [];
    try {
      const url =
        `${MARC_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
        `&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&step_minutes=60`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = (await resp.json()) as Parameters<typeof classifyAnswer>[0] & { declined?: unknown };
      if (Array.isArray(body.declined)) declinedList = body.declined as DeclinedAtlas[];
      const answer = classifyAnswer(body);
      if (answer.kind === "land") {
        // Inland: the server refuses to answer, the card says so and stops.
        return (
          `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>` +
          `<dl class="methodo-map-popup-grid">${row(t("config.methodo.tidal.popup.source"), esc(t("config.methodo.tidal.popup.land")))}</dl>`
        );
      }
      if (answer.kind === "unknown" && answer.unknown) {
        unknownAnswer = answer.unknown;
        answerLabel = answer.label;
      }
      precision = answer.precision;
      const what =
        answer.kind === "shom"
          ? t("config.methodo.tidal.popup.shom", { distance: String(answer.shomDistanceM ?? "?") })
          : answer.kind === "atlas"
            ? t("config.methodo.tidal.popup.atlas", { size: formatGridSize(answer.resolutionM ?? 0) })
            : t("config.methodo.tidal.popup.smoc");
      answerHtml = `${esc(what)}<br><code>${esc(answer.label)}</code>`;
      answerLabel = answer.label;
    } catch {
      answerHtml = `<em>${esc(t("config.methodo.tidal.popup.error"))}</em>`;
    }
    // Every served atlas whose tiles hold the point, in cascade order; the
    // one the server named is the choice, the rest were passed over for a
    // lower rank or a coarser grid, and SMOC waits underneath all of them.
    const byName = new Map(gridsRef.current.map((g) => [g.entry.atlas, g.entry]));
    const describe = (name: string) => {
      const e = byName.get(name);
      return e ? { rank: e.rank ?? 0, resolution_m: e.resolution_m } : null;
    };
    const cascade = cascadeAt(lat, lon, servedRef.current?.atlases ?? [], describe);
    const chosen = cascade.find((a) => labelNamesAtlas(answerLabel, a)) ?? null;
    const rankOf = (a: CoverageAtlas) => a.rank ?? byName.get(a.name)?.rank ?? 0;
    const resOf = (a: CoverageAtlas) => a.resolution_m ?? byName.get(a.name)?.resolution_m ?? null;
    // The server's own reason first: a weak tide, a box cut out by the policy.
    const declinedText = (d: DeclinedAtlas): string =>
      d.reason === "weak_tide"
        ? d.max_tide_kt != null
          ? t("config.methodo.tidal.reason.weakTide", { kt: fmtKt(d.max_tide_kt) })
          : t("config.methodo.tidal.reason.weakTideBuild")
        : d.reason === "excluded" && d.box === "atlantic"
          ? t("config.methodo.tidal.reason.outsideValidity")
        : d.reason === "excluded"
          ? t("config.methodo.tidal.reason.excludedBox", {
              box: d.box === "gibraltar" ? t("config.methodo.tidal.box.gibraltar") : (d.box ?? "?"),
            })
          : t("config.methodo.tidal.reason.noCell");
    const declinedByName = new Map(declinedList.map((d) => [d.atlas, d]));
    // Why the cascade passed an atlas over, relative to the one it chose.
    const reason = (a: CoverageAtlas): string => {
      const said = declinedByName.get(a.name);
      if (said) return declinedText(said);
      if (a.source === "shom") return t("config.methodo.tidal.reason.noShomPoint");
      if (!chosen) return t("config.methodo.tidal.reason.noCell");
      if (chosen.source === "shom") return t("config.methodo.tidal.reason.afterShom");
      if (rankOf(a) < rankOf(chosen)) return t("config.methodo.tidal.reason.lowerRank");
      const ra = resOf(a);
      const rc = resOf(chosen);
      if (ra != null && rc != null && ra > rc) return t("config.methodo.tidal.reason.coarser");
      return t("config.methodo.tidal.reason.tie");
    };
    const SOURCE_NAME: Record<string, string> = { marc: "MARC", bsh: "BSH", cmems: "Copernicus", shom: "SHOM" };
    const shortName = (a: CoverageAtlas) => {
      // An older server lists every harmonic atlas as "marc": the name's own
      // prefix (BSH_DB, CMEMS_NWS) says better.
      const prefixed = /^(BSH|CMEMS)_/i.exec(a.name);
      const src = prefixed ? prefixed[1].toLowerCase() : (a.source ?? "");
      const zone = a.name.replace(new RegExp(`^${src}_`, "i"), "").replace(/_/g, " ");
      return `${SOURCE_NAME[src] ?? src} ${a.source === "shom" ? zone.toLowerCase() : zone}`;
    };
    const passedOver = cascade
      .filter((a) => a !== chosen)
      // When the global model answers, the atlases that declined are already
      // the "why" row: listing them twice says nothing more.
      .filter((a) => !(answerLabel === "openmeteo_smoc" && declinedByName.has(a.name)))
      .map((a) => {
        const res = a.source === "shom" ? null : resOf(a);
        return esc([shortName(a), res == null ? null : formatGridSize(res), reason(a)].filter(Boolean).join(" · "));
      });
    if (unknownAnswer) {
      // Every source that holds the point, SMOC included, is set aside: the
      // zone withholds the current whatever they say.
      const setAside = [...cascade.map((a) => shortName(a)), "SMOC · 8 km"].map((n) =>
        esc(`${n} · ${t("config.methodo.tidal.reason.unknownZone")}`),
      );
      return (
        `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.unknownTitle"))}</h3>` +
        badge(UNKNOWN_ZONE_COLOR, t("config.methodo.tidal.status.unknownZone")) +
        `<dl class="methodo-map-popup-grid">` +
        row(t("config.methodo.tidal.popup.why"), esc(t(`explore.marineTable.unknown.${unknownAnswer.reason}`, { zone: unknownAnswer.zone }))) +
        row(t("config.methodo.tidal.popup.passedOver"), setAside.join("<br>")) +
        `</dl>`
      );
    }
    if (answerLabel !== "openmeteo_smoc") passedOver.push(esc(`SMOC · 8 km · ${t("config.methodo.tidal.reason.fallback")}`));
    // When the global model answers: which atlases held the point and passed,
    // or that none is there at all. The general current is an answer, not a gap.
    const generalWhy = declinedList.length
      ? declinedList
          .map((d) => esc(`${shortName({ name: d.atlas, source: d.label.split("_")[0] } as CoverageAtlas)} · ${formatGridSize(d.resolution_m)} · ${declinedText(d)}`))
          .join("<br>")
      : esc(t("config.methodo.tidal.reason.noAtlas"));
    return (
      `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>` +
      (precision ? badge(PRECISION_COLOR[precision], t(`config.methodo.tidal.precision.${precision}`)) : "") +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.popup.source"), answerHtml) +
      row(t("config.methodo.tidal.popup.why"), answerLabel === "openmeteo_smoc" ? generalWhy : null) +
      row(t("config.methodo.tidal.popup.passedOver"), passedOver.length ? passedOver.join("<br>") : null) +
      sourcesRows(lat, lon, usedSourceId(chosen?.source === "shom" ? "shom" : (chosen?.name ?? null), answerLabel === "openmeteo_smoc"), null, null) +
      `</dl>`
    );
  }

  // The sources that hold a point, one line each: the one the app uses,
  // with its spring maximum, the integrated ones, the missing ones and why
  // in a word. A name opens its row in the registry under the map, where the
  // licence, the access and the plan are spelled out. Then the nearest pass
  // and its published stream.
  function sourcesRows(lat: number, lon: number, usedId: string | null, usedKt: number | null, heldBy: ReadonlySet<string> | null): string {
    const d = dataRef.current;
    const live = (p: SourceProperties) => liveStatus(p, servedRef.current?.names ?? null);
    const features = d?.sources.features ?? [];
    const usedResolutionM = features.find((f) => f.properties.id === usedId)?.properties.resolution_m ?? null;
    const items = sourcesAt(lat, lon, features, live, usedId, { heldBy, usedResolutionM }).map(({ source: p, role }) => {
      const grid = p.resolution_m ? ` · ${esc(formatGridSize(p.resolution_m))}` : "";
      const kt = role === "used" && usedKt != null ? ` · ${esc(t("config.methodo.tidal.here.maxKt", { kt: fmtKt(usedKt) }))}` : "";
      return (
        `<li><a href="#tidal-row-${esc(p.id)}" data-source-id="${esc(p.id)}">${esc(shortSourceName(p.name))}</a>${grid}${kt} ` +
        badge(ROLE_COLOR[role], t(`config.methodo.tidal.here.${role}` as Parameters<typeof t>[0])) +
        `</li>`
      );
    });
    const near = nearestPass(lat, lon, d?.passes ?? null);
    const pass = near
      ? t("config.methodo.tidal.popup.passValue", {
          name: near.feature.properties.name,
          kt: near.feature.properties.max_spring_kt != null ? near.feature.properties.max_spring_kt.toLocaleString(locale) : (near.feature.properties.max_spring_text ?? "?"),
          km: near.km.toFixed(0),
        })
      : null;
    return (
      // The list spans the card: five names with their grid and role do
      // not fit the value column on a phone.
      `<dt class="methodo-map-wide">${esc(t("config.methodo.tidal.popup.sourcesHere"))}</dt>` +
      `<dd class="methodo-map-wide">${
        items.length
          ? `<ul class="methodo-map-here">${items.join("")}</ul><small>${esc(t("config.methodo.tidal.popup.sourcesHint"))}</small>`
          : esc(t("config.methodo.tidal.popup.none"))
      }</dd>` +
      row(t("config.methodo.tidal.popup.pass"), pass ? esc(pass) : null)
    );
  }

  /** The registry id behind the server's answer: the entry listing the
      atlas it used (``shom`` for SHOM), the global current when no atlas
      answers. */
  function usedSourceId(atlas: string | null, global: boolean): string | null {
    if (global) return SMOC_SOURCE_ID;
    if (!atlas) return null;
    return dataRef.current?.sources.features.find((f) => f.properties.atlases?.includes(atlas))?.properties.id ?? null;
  }

  // The card for a click, from the server's own audit of the point
  // (``/api/v1/marine/marc/explain``): what a passage uses here and why, in
  // the cascade's words. Falls back to the overlay-based card when the
  // server does not know the route yet (a web deploy ahead of the Space).
  async function clickPopup(lat: number, lon: number): Promise<string> {
    let e: Explain;
    try {
      const resp = await fetch(`${EXPLAIN_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      e = (await resp.json()) as Explain;
      if (!e?.answer?.kind) throw new Error("no answer");
    } catch {
      return legacyClickPopup(lat, lon);
    }
    const a = e.answer;
    if (a.kind === "land") {
      return (
        `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>` +
        `<dl class="methodo-map-popup-grid">${row(t("config.methodo.tidal.popup.source"), esc(t("config.methodo.tidal.popup.land")))}</dl>`
      );
    }
    const used = e.atlases.find((x) => x.decision === "used") ?? null;
    // The atlases that hold the point, used or passed over for a finer
    // grid, a weak tide or dead water: the integrated sources worth a line.
    const heldBy = new Set(
      e.atlases.filter((x) => ["used", "lower_priority", "weak_tide", "dead_water"].includes(x.decision)).map((x) => x.atlas),
    );
    if (e.shom?.covers) heldBy.add("shom");
    let title = t("config.methodo.tidal.popup.title");
    let tag = "";
    let why: string | null = null;
    let usedId: string | null = null;
    if (a.kind === "unknown") {
      title = t("config.methodo.tidal.popup.unknownTitle");
      tag = badge(UNKNOWN_ZONE_COLOR, t("config.methodo.tidal.status.unknownZone"));
      const reason = (["managed", "unresolved", "non_tidal", "model_edge"] as const).find((r) => r === a.reason) ?? "managed";
      why = esc(t(`explore.marineTable.unknown.${reason}`, { zone: a.zone ?? "" }));
    } else if (a.kind === "shom") {
      tag = badge(PRECISION_COLOR.fine, t("config.methodo.tidal.precision.fine"));
      usedId = usedSourceId("shom", false);
    } else if (a.kind === "atlas") {
      const precision = precisionClass(a.resolution_m ?? null);
      tag = badge(PRECISION_COLOR[precision], t(`config.methodo.tidal.precision.${precision}`));
      usedId = usedSourceId(used?.atlas ?? null, false);
    } else {
      tag = badge(PRECISION_COLOR.global, t("config.methodo.tidal.precision.global"));
      usedId = usedSourceId(null, true);
    }
    const plan = e.plan?.blind_pass
      ? esc(t("config.methodo.tidal.plan.blindPass", { name: e.plan.blind_pass.name, km: fmtKt(e.plan.blind_pass.km) }))
      : e.plan?.tidal_gap
        ? e.plan.tidal_gap.zone && e.plan.tidal_gap.kind === "pass"
          ? esc(t("config.methodo.tidal.plan.tidalGap", { zone: e.plan.tidal_gap.zone, km: fmtKt(e.plan.tidal_gap.km) }))
          : esc(t("config.methodo.tidal.plan.tidalGapZone"))
        : null;
    return (
      `<h3 class="methodo-map-popup-title">${esc(title)}</h3>` +
      tag +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.popup.why"), why) +
      sourcesRows(lat, lon, usedId, a.kind === "atlas" ? (a.max_tide_kt ?? null) : null, heldBy) +
      row(t("config.methodo.tidal.popup.plan"), plan) +
      `</dl>`
    );
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [51, 1], zoom: 4, worldCopyJump: true, scrollWheelZoom: false });
    // The sea itself is the "general currents" colour: everywhere no tidal
    // atlas answers, the app uses Copernicus's general current.
    addBasemap(map, "light", { seaColor: GENERAL_SEA_COLOR });
    mapRef.current = map;
    // The figure sits in a lazily rendered article: its box settles after
    // the map is created (fonts, images, the phone's toolbar), and Leaflet
    // caches the container size. Without this the vector basemap, which
    // resizes itself, and the Leaflet layers (rasters, markers) drift apart
    // by the size difference until a zoom recomputes everything, and the
    // rasters read as shifted south. Same recipe as SpotMap.
    const settle = window.setTimeout(() => map.invalidateSize({ animate: false }), 200);
    const resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resizer?.observe(containerRef.current);
    // A source name in a card opens its registry row. Capture phase: a
    // Leaflet popup stops the clicks that bubble out of it.
    const container = containerRef.current;
    const onSourceLink = (ev: MouseEvent) => {
      const link = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-source-id]");
      const id = link?.dataset.sourceId;
      if (!id) return;
      ev.preventDefault();
      ev.stopPropagation();
      map.closePopup();
      focusSourceRef.current?.(id);
    };
    container.addEventListener("click", onSourceLink, true);
    map.on("click", (e: L.LeafletMouseEvent) => {
      const popup = L.popup(popupOptions(map))
        .setLatLng(e.latlng)
        .setContent(`<em>${esc(t("config.methodo.tidal.popup.loading"))}</em>`)
        .openOn(map);
      void clickPopup(e.latlng.lat, e.latlng.lng).then((html) => {
        if (popup.isOpen()) popup.setContent(html);
      });
    });
    let cancelled = false;
    loadLayers()
      .then((d) => {
        if (cancelled) return;
        dataRef.current = d;
        setSources(sortedSources(d.sources));
        void loadServed().then((s) => {
          if (cancelled) return;
          servedRef.current = s;
          setServed(s?.names ?? null);
          setServedAtlases(s?.atlases ?? []);
          setSources(sortedSources(d.sources, s?.names ?? null));
        });
        // The uncovered strong zones as polygons; the covered water comes
        // from the rasters, drawn underneath, coarse first and fine on top.
        const rasterPane = map.createPane("tidal-rasters");
        rasterPane.style.zIndex = "350";
        void loadRasters()
          .then(({ grids, overlays }) => {
            if (cancelled) return;
            gridsRef.current = grids;
            const layers = overlays.map((o) => ({
              layer: L.imageOverlay(o.url, o.bounds, { opacity: 0.85, interactive: false, pane: "tidal-rasters" }).addTo(map),
              bounds: L.latLngBounds(o.bounds as L.LatLngTuple[]),
              width: o.width,
            }));
            // A raster pixel wider than a screen pixel is drawn as a crisp
            // square; narrower, it is smoothed: nearest-neighbour shrinking
            // drops pixels and reads as grain.
            const rendering = () => {
              for (const { layer, bounds, width } of layers) {
                const px = Math.abs(map.latLngToLayerPoint(bounds.getNorthEast()).x - map.latLngToLayerPoint(bounds.getSouthWest()).x) / width;
                const img = layer.getElement();
                if (img) img.style.imageRendering = px >= 1 ? "pixelated" : "auto";
              }
            };
            rendering();
            map.on("zoomend", rendering);
          })
          .catch(() => undefined);
        L.geoJSON(
          { type: "FeatureCollection", features: d.status.features.filter((f) => f.properties.status !== "covered" && f.properties.status !== "calm") } as StatusFC,
          {
            style: (f) => {
              const z = (f?.properties as ZoneProperties | undefined) ?? { status: "unknown" };
              const color = STATUS_COLOR[z.status];
              return { color, weight: 0.6, fillColor: color, fillOpacity: 0.5, interactive: false };
            },
          },
        ).addTo(map);
        L.geoJSON(unknownZones as unknown as FeatureCollection, {
          style: { color: "#374151", weight: 1.2, dashArray: "4 3", fillColor: UNKNOWN_ZONE_COLOR, fillOpacity: 0.6, interactive: false },
        }).addTo(map);
        L.geoJSON(d.objective, { style: { color: OBJECTIVE_COLOR, weight: 1.5, dashArray: "8 6", fill: false, interactive: false } }).addTo(map);
        L.geoJSON(d.passes, {
          pointToLayer: (f, ll) => {
            const p = (f as Feature<Point, PassProperties>).properties;
            const color = STATUS_COLOR[p.status] ?? STATUS_COLOR.unknown;
            return L.circleMarker(ll, { radius: passRadius(p), color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.95 });
          },
          onEachFeature: (f, l) => l.bindPopup(passPopup((f as Feature<Point, PassProperties>).properties), popupOptions(map)),
        }).addTo(map);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
      resizer?.disconnect();
      container.removeEventListener("click", onSourceLink, true);
      map.remove();
      mapRef.current = null;
      sourceLayersRef.current = new Map();
    };
    // The map is created once; `t` is read through the module-level store
    // at event time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ticked registry row draws that source's extent; unticking removes it.
  useEffect(() => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d) return;
    for (const f of d.sources.features) {
      const id = f.properties.id;
      const layer = sourceLayersRef.current.get(id);
      if (shown[id] && !layer) {
        const color = SOURCE_COLOR[f.properties.status] ?? "#999";
        const l = L.geoJSON(f as Feature, {
          style: { color, weight: 2, dashArray: f.properties.status === "ok" || f.properties.status === "current" ? undefined : "5 4", fillColor: color, fillOpacity: 0.08 },
        }).bindPopup(sourcePopup(t, f.properties, served), popupOptions(map));
        l.addTo(map);
        sourceLayersRef.current.set(id, l);
        // Show where the ticked source is: frame its extent (a worldwide
        // source keeps the current view), and bring the map back on screen
        // when the table sits below it, as on a phone.
        const bounds = l.getBounds();
        if (bounds.isValid() && bounds.getEast() - bounds.getWest() < 180) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
        }
        const box = containerRef.current?.getBoundingClientRect();
        if (box && (box.bottom < 0 || box.top > window.innerHeight - 80)) {
          containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else if (!shown[id] && layer) {
        map.removeLayer(layer);
        sourceLayersRef.current.delete(id);
      }
    }
  }, [shown, status, t, served]);

  // Full screen: the stage is pinned over the page by CSS everywhere (the
  // iPhone has no element full-screen API), and the browser's own full
  // screen is asked for on top where it exists, to hide its toolbars. Escape,
  // the button and the Android back gesture all close it.
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  focusSourceRef.current = (id: string) => {
    setFullscreen(false);
    setRegistryOpen(true);
    setFocusedSource(id);
    // After the registry has rendered open: unfold the row's details and
    // bring it on screen.
    window.setTimeout(() => {
      const tr = document.getElementById(`tidal-row-${id}`);
      tr?.querySelector("details")?.setAttribute("open", "");
      tr?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };
  const closeFullscreen = useCallback(() => setFullscreen(false), []);
  useBackDismiss(fullscreen, closeFullscreen);
  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      if (fullscreen) map.scrollWheelZoom.enable();
      else map.scrollWheelZoom.disable();
    }
    if (!fullscreen) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const stage = stageRef.current;
    if (stage?.requestFullscreen && !document.fullscreenElement) {
      void stage.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    // Leaving the browser's full screen by its own gesture closes ours too.
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onChange);
    document.documentElement.classList.add("methodo-map-locked");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onChange);
      document.documentElement.classList.remove("methodo-map-locked");
    };
  }, [fullscreen]);

  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(t("config.methodo.tidal.sources.proposeSubject"))}`;

  return (
    <figure className="methodo-map">
      <div className="methodo-map-main">
      <p className="methodo-map-hint">{t("config.methodo.tidal.hint")}</p>
      <div ref={stageRef} className={`methodo-map-stage${fullscreen ? " is-fullscreen" : ""}`}>
        <div ref={containerRef} className="methodo-map-canvas" role="application" aria-busy={status === "loading"} />
        <button
          type="button"
          className="methodo-map-fullscreen"
          aria-pressed={fullscreen}
          aria-label={t(fullscreen ? "config.methodo.tidal.fullscreen.exit" : "config.methodo.tidal.fullscreen.enter")}
          title={t(fullscreen ? "config.methodo.tidal.fullscreen.exit" : "config.methodo.tidal.fullscreen.enter")}
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          )}
        </button>
        {fullscreen && (
          <div className="methodo-map-fs-legend" aria-hidden="true">
            <span className="methodo-map-ramp" style={{ background: rampGradient() }} />
            <span>{t("config.methodo.tidal.fullscreen.ramp")}</span>
          </div>
        )}
      </div>
      <div className="methodo-map-legend">
        <div className="methodo-map-group-title">{t("config.methodo.tidal.legend.title")}</div>
        <div className="methodo-map-item">
          <span className="methodo-map-ramp" aria-hidden="true" style={{ background: rampGradient() }} />
          <span>{t("config.methodo.tidal.legend.covered")}</span>
        </div>
        {ZONE_STATUSES.filter((s) => s !== "covered").map((s) => (
          <div className="methodo-map-item" key={s}>
            <span className="methodo-map-swatch" style={{ background: s === "calm" ? CALM_COLOR : STATUS_COLOR[s] }} />
            <span>{t(`config.methodo.tidal.legend.${s}`)}</span>
          </div>
        ))}
        <div className="methodo-map-item">
          <span className="methodo-map-swatch is-round" style={{ background: STATUS_COLOR.covered, borderColor: "#fff" }} />
          <span>{t("config.methodo.tidal.legend.passes")}</span>
        </div>
        <div className="methodo-map-item">
          <span className="methodo-map-swatch" style={{ background: GENERAL_SEA_COLOR }} />
          <span>{t("config.methodo.tidal.legend.negligible")}</span>
        </div>
        <div className="methodo-map-item">
          <span className="methodo-map-swatch" style={{ background: UNKNOWN_ZONE_COLOR, opacity: 0.6 }} />
          <span>{t("config.methodo.tidal.legend.unknownZone")}</span>
        </div>
        <div className="methodo-map-item">
          <span className="methodo-map-swatch is-dashed" style={{ borderColor: OBJECTIVE_COLOR }} />
          <span>{t("config.methodo.tidal.legend.objective")}</span>
        </div>
      </div>
      </div>
      <details className="methodo-map-sources" open={registryOpen} onToggle={(e) => setRegistryOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{t("config.methodo.tidal.sources.title")}</summary>
        <div className="methodo-map-table-wrap">
          <table className="methodo-map-table">
            <thead>
              <tr>
                <th scope="col" aria-label={t("config.methodo.tidal.sources.show")} />
                <th scope="col">{t("config.methodo.tidal.sources.name")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.grid")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.status")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.accessKind")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.automation")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.cadence")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.freshness")}</th>
              </tr>
            </thead>
            <tbody>
              {sources
                .filter((p) => !p.hide_in_table)
                .map((p) => {
                  const live = liveStatus(p, served);
                  const atlasesHere = servedAtlases.filter((a) => p.atlases?.includes(a.name) || (a.source !== undefined && p.atlases?.includes(a.source)));
                  const fresh = sourceFreshness(p.update_cadence, live === "current" ? atlasesHere : []);
                  return (
                    <tr
                      key={p.id}
                      id={`tidal-row-${p.id}`}
                      className={[shown[p.id] ? "is-shown" : "", focusedSource === p.id ? "is-focused" : ""].filter(Boolean).join(" ") || undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          id={`tidal-source-${p.id}`}
                          aria-label={p.name}
                          checked={Boolean(shown[p.id])}
                          onChange={() => setShown((v) => ({ ...v, [p.id]: !v[p.id] }))}
                        />
                      </td>
                      <td>
                        <label htmlFor={`tidal-source-${p.id}`}>{p.name}</label>
                        <div className="methodo-map-sub">{p.provider}</div>
                        {(p.acquisition || p.update_plan) && (
                          <details className="methodo-map-how">
                            <summary>{t("config.methodo.tidal.sources.how")}</summary>
                            {p.acquisition && (
                              <p>
                                <strong>{t("config.methodo.tidal.sources.accessHow")}</strong> {p.acquisition}
                              </p>
                            )}
                            {p.update_plan && (
                              <p>
                                <strong>{t("config.methodo.tidal.sources.updateHow")}</strong> {p.update_plan}
                              </p>
                            )}
                          </details>
                        )}
                      </td>
                      <td>{p.resolution_m ? formatGridSize(p.resolution_m) : <span className="methodo-map-sub">—</span>}</td>
                      <td>
                        <span className="methodo-map-badge" style={{ background: SOURCE_COLOR[live] ?? "#999" }}>
                          {t(`config.methodo.tidal.source.status.${live}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td>
                        {p.access_kind ? t(`config.methodo.tidal.access.${p.access_kind}` as Parameters<typeof t>[0]) : null}
                        <div className="methodo-map-licence">
                          <a
                            href={p.licence_url}
                            target="_blank"
                            rel="noopener"
                            title={p.licence}
                            className={p.licence_class ? `methodo-map-chip is-licence-${p.licence_class}` : undefined}
                          >
                            {p.licence_class ? t(`config.methodo.tidal.licenceClass.${p.licence_class}` as Parameters<typeof t>[0]) : p.licence}
                          </a>
                        </div>
                      </td>
                      <td>
                        {p.automation && (
                          <span className={`methodo-map-chip is-${p.automation}`}>
                            {t(`config.methodo.tidal.automation.${p.automation}` as Parameters<typeof t>[0])}
                          </span>
                        )}
                      </td>
                      <td>{p.update_cadence ? t(`config.methodo.tidal.cadence.${p.update_cadence}` as Parameters<typeof t>[0]) : null}</td>
                      <td>
                        {fresh.state === "unserved" ? (
                          <span className="methodo-map-sub">—</span>
                        ) : (
                          <span className={`methodo-map-chip is-${fresh.state}`} title={fresh.asOf ? fresh.asOf.slice(0, 10) : undefined}>
                            {t(`config.methodo.tidal.freshness.${fresh.state}` as Parameters<typeof t>[0])}
                            {fresh.asOf ? ` · ${fresh.asOf.slice(0, 10)}` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              <tr className="methodo-map-propose">
                <td colSpan={8}>
                  <a href={mailto}>{t("config.methodo.tidal.sources.propose")}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="methodo-map-sub methodo-map-freshness-note">{t("config.methodo.tidal.freshness.note")}</p>
      </details>
      <figcaption className="methodo-map-note">
        {status === "error" ? t("config.methodo.tidal.popup.error") : t("config.methodo.tidal.note")}
      </figcaption>
    </figure>
  );
}

export default TidalSourcesMap;
