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
  currentBand,
  esc,
  nearestPass,
  pointInGeometry,
  statusAt,
  type PassProperties,
  type PrecisionClass,
  type ZoneStatus,
} from "../domain/tidalMapGeo";
import { useT } from "../i18n";
import { addBasemap } from "../utils/basemapLayer";

const DATA_BASE = `${import.meta.env.BASE_URL}methodologie/tidal/`;
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;
const CONTACT = "contact@ohmywind.fr";

type MaskFC = FeatureCollection<Geometry, { threshold_kt: number; global?: boolean }>;
type PassFC = FeatureCollection<Point, PassProperties>;
type StatusFC = FeatureCollection<Geometry, { status: ZoneStatus }>;
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
}
type SourceFC = FeatureCollection<Geometry, SourceProperties>;

interface Layers {
  masks: MaskFC;
  passes: PassFC;
  status: StatusFC;
  objective: FeatureCollection;
  sources: SourceFC;
  footprint: FeatureCollection;
}

const STATUS_COLOR: Record<ZoneStatus, string> = {
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
const PRECISION_COLOR: Record<PrecisionClass, string> = {
  fine: STATUS_COLOR.covered,
  medium: STATUS_COLOR.covered,
  coarse: STATUS_COLOR.target,
  global: STATUS_COLOR.unknown,
};

async function loadJson<T>(name: string): Promise<T> {
  const resp = await fetch(`${DATA_BASE}${name}`);
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/** The computed "where the current is" masks, finest first: ATLNE (2 km,
    North-East Atlantic) over FES2014 (7 km, world) when the latter has been
    built. A missing file is simply skipped. */
async function loadMasks(): Promise<MaskFC> {
  const [atlne, fes] = await Promise.all(
    ["mask_atlne.geojson", "mask_fes.geojson"].map((name) => loadJson<MaskFC>(name).catch(() => null)),
  );
  const worldwide = (fes?.features ?? []).map((f) => ({ ...f, properties: { ...f.properties, global: true } }));
  return { type: "FeatureCollection", features: [...(atlne?.features ?? []), ...worldwide] };
}

async function loadLayers(): Promise<Layers> {
  const [masks, passes, status, objective, sources, footprint] = await Promise.all([
    loadMasks(),
    loadJson<PassFC>("gazetteer.geojson"),
    loadJson<StatusFC>("status.geojson"),
    loadJson<FeatureCollection>("objective.geojson"),
    loadJson<SourceFC>("sources.geojson"),
    loadJson<FeatureCollection>("atlne_footprint.geojson").catch(() => ({ type: "FeatureCollection", features: [] }) as FeatureCollection),
  ]);
  return { masks, passes, status, objective, sources, footprint };
}

const passRadius = (p: PassProperties) => 3 + Math.min(7, (p.max_spring_kt ?? 1) * 0.6);
const sortedSources = (fc: SourceFC): SourceProperties[] =>
  fc.features
    .map((f) => f.properties)
    .sort((a, b) => SOURCE_ORDER.indexOf(a.status) - SOURCE_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
const POPUP = { maxWidth: 360, className: "methodo-map-popup" };

type Translate = ReturnType<typeof useT>["t"];
const badge = (color: string, text: string) => `<span class="methodo-map-badge" style="background:${color}">${esc(text)}</span>`;
const row = (k: string, v: string | null | undefined) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : "");

function sourcePopup(t: Translate, p: SourceProperties): string {
  return (
    `<h3 class="methodo-map-popup-title">${esc(p.name)}</h3>` +
    badge(SOURCE_COLOR[p.status] ?? "#999", t(`config.methodo.tidal.source.status.${p.status}` as Parameters<typeof t>[0])) +
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
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataRef = useRef<Layers | null>(null);
  const sourceLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<SourceProperties[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const statusText = (s: ZoneStatus | null) => t(`config.methodo.tidal.status.${s ?? "none"}`);

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
    const footprint = d?.footprint.features[0]?.geometry ?? null;
    const band = currentBand(lon, lat, d?.masks ?? null, footprint);
    const zone = statusAt(lon, lat, d?.status ?? null);
    const near = nearestPass(lat, lon, d?.passes ?? null);
    const inObjective = d?.objective.features.some((f) => pointInGeometry(lon, lat, f.geometry)) ?? false;
    const candidates = (d?.sources.features ?? [])
      .filter((f) => f.properties.status === "ok" && f.properties.kind !== "station_points" && pointInGeometry(lon, lat, f.geometry))
      .sort((a, b) => (a.properties.resolution_m ?? 1e9) - (b.properties.resolution_m ?? 1e9))
      .slice(0, 3)
      .map((f) => `${esc(f.properties.name)}${f.properties.resolution_m ? ` (${f.properties.resolution_m} m)` : ""}`);
    return (
      `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>` +
      (precision ? badge(PRECISION_COLOR[precision], t(`config.methodo.tidal.precision.${precision}`)) : "") +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.popup.source"), answerHtml) +
      row(t("config.methodo.tidal.popup.status"), zone ? badge(STATUS_COLOR[zone], statusText(zone)) : esc(statusText(null))) +
      row(t("config.methodo.tidal.popup.current"), esc(t(`config.methodo.tidal.current.${band}`))) +
      row(
        t("config.methodo.tidal.popup.pass"),
        near
          ? esc(t("config.methodo.tidal.popup.passValue", { name: near.feature.properties.name, kt: near.feature.properties.max_spring_text ?? "?", km: near.km.toFixed(0) }))
          : null,
      ) +
      row(t("config.methodo.tidal.popup.candidates"), candidates.length ? candidates.join("<br>") : esc(t("config.methodo.tidal.popup.none"))) +
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
      const popup = L.popup(POPUP)
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
        L.geoJSON(d.status, {
          style: (f) => {
            const color = STATUS_COLOR[(f?.properties as { status: ZoneStatus } | undefined)?.status ?? "unknown"];
            return { color, weight: 0.6, fillColor: color, fillOpacity: 0.5, interactive: false };
          },
        }).addTo(map);
        L.geoJSON(d.objective, { style: { color: OBJECTIVE_COLOR, weight: 1.5, dashArray: "8 6", fill: false, interactive: false } }).addTo(map);
        L.geoJSON(d.passes, {
          pointToLayer: (f, ll) => {
            const p = (f as Feature<Point, PassProperties>).properties;
            const color = STATUS_COLOR[p.status] ?? STATUS_COLOR.unknown;
            return L.circleMarker(ll, { radius: passRadius(p), color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.95 });
          },
          onEachFeature: (f, l) => l.bindPopup(passPopup((f as Feature<Point, PassProperties>).properties), POPUP),
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
        }).bindPopup(sourcePopup(t, f.properties), POPUP);
        l.addTo(map);
        sourceLayersRef.current.set(id, l);
      } else if (!shown[id] && layer) {
        map.removeLayer(layer);
        sourceLayersRef.current.delete(id);
      }
    }
  }, [shown, status, t]);

  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(t("config.methodo.tidal.sources.proposeSubject"))}`;

  return (
    <figure className="methodo-map">
      <p className="methodo-map-hint">{t("config.methodo.tidal.hint")}</p>
      <div ref={containerRef} className="methodo-map-canvas" role="application" aria-busy={status === "loading"} />
      <div className="methodo-map-legend">
        <div className="methodo-map-group-title">{t("config.methodo.tidal.legend.title")}</div>
        {ZONE_STATUSES.map((s) => (
          <div className="methodo-map-item" key={s}>
            <span className="methodo-map-swatch" style={{ background: STATUS_COLOR[s] }} />
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
                    <span className="methodo-map-badge" style={{ background: SOURCE_COLOR[p.status] ?? "#999" }}>
                      {t(`config.methodo.tidal.source.status.${p.status}` as Parameters<typeof t>[0])}
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
