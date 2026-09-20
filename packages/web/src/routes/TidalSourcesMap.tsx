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
import { useEffect, useRef, useState } from "react";

import { API_BASE } from "../api/config";
import { formatGridSize } from "../domain/currentSource";
import {
  ZONE_STATUSES,
  classifyAnswer,
  esc,
  isGlobalExtent,
  nearestPass,
  pointInGeometry,
  statusAt,
  type PassProperties,
  type PrecisionClass,
  type ZoneProperties,
  type ZoneStatus,
} from "../domain/tidalMapGeo";
import { CALM_COLOR, RasterGrid, maxCurrentAt, rampColor, rampGradient, type RasterManifest } from "../domain/tidalRaster";
import { useT } from "../i18n";
import { addBasemap } from "../utils/basemapLayer";

const DATA_BASE = `${import.meta.env.BASE_URL}methodologie/tidal/`;
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;
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
  /** Atlas names (or the source short ``shom``) the server would list in
      its coverage when it serves this source. */
  atlases?: string[];
}
type SourceFC = FeatureCollection<Geometry, SourceProperties>;

/** What the server serves right now: the names of its atlases and the
    sources of its point sets, from the coverage endpoint. ``null`` when the
    server could not be asked, then the registry's own status stands. */
async function loadServed(): Promise<Set<string> | null> {
  try {
    const resp = await fetch(COVERAGE_URL);
    if (!resp.ok) return null;
    const payload = (await resp.json()) as { atlases?: { name: string; source?: string }[] };
    const served = new Set<string>();
    for (const a of payload.atlases ?? []) {
      served.add(a.name);
      if (a.source) served.add(a.source);
    }
    return served;
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
}

const STATUS_COLOR: Record<ZoneStatus, string> = {
  calm: "#cfe8d6",
  covered: "#2a9d5c",
  target: "#f28c28",
  blocked: "#7b3fd4",
  unknown: "#d43f3a",
};
const OBJECTIVE_COLOR = "#1f2937";
/** A registry status drawn in the colour of the zone status it would produce. */
const SOURCE_COLOR: Record<string, string> = {
  current: STATUS_COLOR.covered,
  ok: STATUS_COLOR.target,
  clarify: STATUS_COLOR.blocked,
  blocked: STATUS_COLOR.blocked,
  no_currents: "#8a8a84",
};
const SOURCE_ORDER = ["current", "ok", "clarify", "blocked", "no_currents"];
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
  const [passes, status, objective, sources] = await Promise.all([
    loadJson<PassFC>("gazetteer.geojson"),
    loadJson<StatusFC>("status.geojson"),
    loadJson<FeatureCollection>("objective.geojson"),
    loadJson<SourceFC>("sources.geojson"),
  ]);
  return { passes, status, objective, sources };
}

/** The maximum-current rasters, decoded: each PNG is drawn through a canvas
    into an image overlay (calm colour under 0.5 kt, the ramp above, nothing
    where the atlas has no cell) and kept for the value under a click. Best
    effort: a missing manifest or a browser without canvas leaves the map
    without them. */
async function loadRasters(): Promise<{ grids: RasterGrid[]; overlays: { url: string; bounds: L.LatLngBoundsExpression }[] }> {
  const manifest = await loadJson<RasterManifest>("raster/rasters.json");
  const grids: RasterGrid[] = [];
  const overlays: { url: string; bounds: L.LatLngBoundsExpression }[] = [];
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
      let rgb = cache.get(v);
      if (!rgb) {
        const kt = (v - 1) / entry.scale;
        rgb = kt >= 0.5 ? hexToRgb(rampColor(kt)) : hexToRgb(CALM_COLOR);
        cache.set(v, rgb);
      }
      out.data[i * 4] = rgb[0];
      out.data[i * 4 + 1] = rgb[1];
      out.data[i * 4 + 2] = rgb[2];
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    grids.push(new RasterGrid(entry, canvas.width, canvas.height, values));
    overlays.push({ url: canvas.toDataURL("image/png"), bounds: entry.bounds });
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
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<SourceProperties[]>([]);
  const [served, setServed] = useState<Set<string> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const statusText = (s: ZoneStatus | null) => t(`config.methodo.tidal.status.${s ?? "none"}`);
  const fmtKt = (kt: number) => kt.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // What the card says about the tide at a point: the value of the finest
  // served atlas under it, else the status of an uncovered strong zone.
  const zoneBadge = (lat: number, lon: number, z: ZoneProperties | null): string => {
    const hit = maxCurrentAt(lat, lon, gridsRef.current);
    if (hit) {
      const text =
        hit.kt >= 0.5
          ? t("config.methodo.tidal.status.coveredValue", { kt: fmtKt(hit.kt), atlas: hit.entry.label })
          : t("config.methodo.tidal.status.calmValue", { kt: fmtKt(hit.kt), atlas: hit.entry.label });
      return badge(hit.kt >= 0.5 ? rampColor(hit.kt) : "#7fb08f", text);
    }
    if (z && z.status !== "covered" && z.status !== "calm") return badge(STATUS_COLOR[z.status], statusText(z.status));
    return esc(statusText(null));
  };

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

  // The card for a click: the server's own answer for the point, framed
  // by what the static layers know about it.
  async function clickPopup(lat: number, lon: number): Promise<string> {
    const d = dataRef.current;
    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3600_000);
    let answerHtml: string;
    let precision: PrecisionClass | null = null;
    try {
      const url =
        `${MARC_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
        `&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&step_minutes=60`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const answer = classifyAnswer((await resp.json()) as Parameters<typeof classifyAnswer>[0]);
      precision = answer.precision;
      const what =
        answer.kind === "shom"
          ? t("config.methodo.tidal.popup.shom", { distance: String(answer.shomDistanceM ?? "?") })
          : answer.kind === "atlas"
            ? t("config.methodo.tidal.popup.atlas", { size: formatGridSize(answer.resolutionM ?? 0) })
            : t("config.methodo.tidal.popup.smoc");
      answerHtml = `${esc(what)}<br><code>${esc(answer.label)}</code>`;
    } catch {
      answerHtml = `<em>${esc(t("config.methodo.tidal.popup.error"))}</em>`;
    }
    const zone = statusAt(lon, lat, d?.status ?? null);
    const near = nearestPass(lat, lon, d?.passes ?? null);
    const inObjective = d?.objective.features.some((f) => pointInGeometry(lon, lat, f.geometry)) ?? false;
    const here = (d?.sources.features ?? [])
      .filter((f) => f.properties.status === "ok" && f.properties.kind !== "station_points" && pointInGeometry(lon, lat, f.geometry))
      .sort((a, b) => (a.properties.resolution_m ?? 1e9) - (b.properties.resolution_m ?? 1e9));
    const label = (f: SourceFC["features"][number]) => `${esc(f.properties.name)}${f.properties.resolution_m ? ` (${f.properties.resolution_m} m)` : ""}`;
    // Same rule as the four colours: a worldwide source is the fallback tier,
    // it never counts as a candidate to cover the zone.
    const candidates = here.filter((f) => !isGlobalExtent(f.geometry)).slice(0, 3).map(label);
    const fallback = here.filter((f) => isGlobalExtent(f.geometry)).map(label);
    return (
      `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>` +
      (precision ? badge(PRECISION_COLOR[precision], t(`config.methodo.tidal.precision.${precision}`)) : "") +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.popup.source"), answerHtml) +
      row(t("config.methodo.tidal.popup.status"), zoneBadge(lat, lon, zone)) +
      row(
        t("config.methodo.tidal.popup.pass"),
        near
          ? esc(t("config.methodo.tidal.popup.passValue", { name: near.feature.properties.name, kt: near.feature.properties.max_spring_text ?? "?", km: near.km.toFixed(0) }))
          : null,
      ) +
      row(t("config.methodo.tidal.popup.candidates"), candidates.length ? candidates.join("<br>") : esc(t("config.methodo.tidal.popup.none"))) +
      row(
        t("config.methodo.tidal.popup.fallback"),
        fallback.length ? `${fallback.join("<br>")}<br><small>${esc(t("config.methodo.tidal.popup.fallbackNote"))}</small>` : null,
      ) +
      row(t("config.methodo.tidal.popup.objective"), esc(t(inObjective ? "config.methodo.tidal.popup.yes" : "config.methodo.tidal.popup.no"))) +
      `</dl>`
    );
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [51, 1], zoom: 4, worldCopyJump: true, scrollWheelZoom: false });
    addBasemap(map, "light");
    mapRef.current = map;
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
          setServed(s);
          setSources(sortedSources(d.sources, s));
        });
        // The uncovered strong zones as polygons; the covered water comes
        // from the rasters, drawn underneath, coarse first and fine on top.
        const rasterPane = map.createPane("tidal-rasters");
        rasterPane.style.zIndex = "350";
        void loadRasters()
          .then(({ grids, overlays }) => {
            if (cancelled) return;
            gridsRef.current = grids;
            for (const o of overlays) L.imageOverlay(o.url, o.bounds, { opacity: 0.72, interactive: false, pane: "tidal-rasters" }).addTo(map);
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
      } else if (!shown[id] && layer) {
        map.removeLayer(layer);
        sourceLayersRef.current.delete(id);
      }
    }
  }, [shown, status, t, served]);

  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(t("config.methodo.tidal.sources.proposeSubject"))}`;

  return (
    <figure className="methodo-map">
      <p className="methodo-map-hint">{t("config.methodo.tidal.hint")}</p>
      <div ref={containerRef} className="methodo-map-canvas" role="application" aria-busy={status === "loading"} />
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
          <span className="methodo-map-swatch is-dashed" style={{ borderColor: OBJECTIVE_COLOR }} />
          <span>{t("config.methodo.tidal.legend.objective")}</span>
        </div>
      </div>
      <details className="methodo-map-sources">
        <summary>{t("config.methodo.tidal.sources.title")}</summary>
        <div className="methodo-map-table-wrap">
          <table className="methodo-map-table">
            <thead>
              <tr>
                <th scope="col">{t("config.methodo.tidal.sources.show")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.name")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.provider")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.licence")}</th>
                <th scope="col">{t("config.methodo.tidal.sources.status")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((p) => (
                <tr key={p.id}>
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
                  </td>
                  <td>{p.provider}</td>
                  <td className="methodo-map-licence" title={p.licence}>
                    <a href={p.licence_url} target="_blank" rel="noopener">
                      {p.licence}
                    </a>
                  </td>
                  <td>
                    <span className="methodo-map-badge" style={{ background: SOURCE_COLOR[liveStatus(p, served)] ?? "#999" }}>
                      {t(`config.methodo.tidal.source.status.${liveStatus(p, served)}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="methodo-map-propose">
                <td colSpan={5}>
                  <a href={mailto}>{t("config.methodo.tidal.sources.propose")}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <figcaption className="methodo-map-note">
        {status === "error" ? t("config.methodo.tidal.popup.error") : t("config.methodo.tidal.note")}
      </figcaption>
    </figure>
  );
}

export default TidalSourcesMap;
