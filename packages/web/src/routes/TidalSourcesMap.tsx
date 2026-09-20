// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The tidal-sources map of /methodologie: where the current matters, what
 * the app uses and at which precision, what is still missing in the target
 * area. Layers come from static files under ``public/methodologie/tidal/``
 * (built by ``scripts/build_tidal_world_map.py`` in the repo); a click asks
 * the server which source it would use at that point, through the same
 * endpoint the plan uses, so the card never disagrees with the app.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { API_BASE } from "../api/config";
import { formatGridSize } from "../domain/currentSource";
import {
  classifyAnswer,
  currentBand,
  esc,
  nearestPass,
  pointInGeometry,
  type PassProperties,
  type PrecisionClass,
} from "../domain/tidalMapGeo";
import { useT } from "../i18n";
import { addBasemap } from "../utils/basemapLayer";

const DATA_BASE = `${import.meta.env.BASE_URL}methodologie/tidal/`;
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;

type MaskFC = FeatureCollection<Geometry, { threshold_kt: number }>;
type PassFC = FeatureCollection<Point, PassProperties>;
type ClassFC = FeatureCollection<Geometry, { class: PrecisionClass }>;
type SpikeFC = FeatureCollection<Geometry, { label: string; name: string; resolution_m: number }>;
type SourceFC = FeatureCollection<
  Geometry,
  {
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
>;
interface ShomPoints {
  zones: string[];
  points: [number, number, number][];
}

interface Layers {
  masks: MaskFC;
  passes: PassFC;
  gapMask: FeatureCollection;
  objective: FeatureCollection;
  classes: ClassFC;
  spike: SpikeFC;
  sources: SourceFC;
  shom: ShomPoints;
  footprint: FeatureCollection;
}

const LAYER_KEYS = [
  "mask05",
  "mask15",
  "passes",
  "shom",
  "fine",
  "medium",
  "coarse",
  "spike",
  "objective",
  "gapMask",
  "gapPasses",
  "sources",
] as const;
type LayerKey = (typeof LAYER_KEYS)[number];

const DEFAULT_ON: Record<LayerKey, boolean> = {
  mask05: true,
  mask15: true,
  passes: true,
  shom: true,
  fine: true,
  medium: true,
  coarse: true,
  spike: true,
  objective: true,
  gapMask: true,
  gapPasses: true,
  sources: false,
};

const COLOR = {
  mask05: "#ffb84d",
  mask15: "#e8590c",
  fine: "#08306b",
  medium: "#2b6cb0",
  coarse: "#9ecae1",
  spike: "#7b3fd4",
  gap: "#d43f3a",
  objective: "#1f2937",
  pass: "#111111",
  ok: "#2a9d5c",
  clarify: "#e0a100",
  blocked: "#d43f3a",
  no_currents: "#8a8a84",
  current: "#2f6fdd",
} as const;

async function loadJson<T>(name: string): Promise<T> {
  const resp = await fetch(`${DATA_BASE}${name}`);
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

async function loadLayers(): Promise<Layers> {
  const [masks, passes, gapMask, objective, classes, spike, sources, shom, footprint] = await Promise.all([
    loadJson<MaskFC>("mask_atlne.geojson"),
    loadJson<PassFC>("gazetteer.geojson"),
    loadJson<FeatureCollection>("gaps_mask.geojson"),
    loadJson<FeatureCollection>("objective.geojson"),
    loadJson<ClassFC>("coverage_effective.geojson"),
    loadJson<SpikeFC>("coverage_spike.geojson"),
    loadJson<SourceFC>("sources.geojson"),
    loadJson<ShomPoints>("shom_points.json"),
    loadJson<FeatureCollection>("atlne_footprint.geojson"),
  ]);
  return { masks, passes, gapMask, objective, classes, spike, sources, shom, footprint };
}

const passRadius = (p: PassProperties) => 3 + Math.min(7, (p.max_spring_kt ?? 1) * 0.6);
const isGap = (f: Feature<Point, PassProperties>) => f.properties.coverage_class === "coarse" || f.properties.coverage_class === "global";

export function TidalSourcesMap() {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Partial<Record<LayerKey, L.Layer>>>({});
  const dataRef = useRef<Layers | null>(null);
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>(DEFAULT_ON);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Popup text for a known pass; reads the dictionary at click time so a
  // language switch after mount still lands in the right words.
  function passPopup(p: PassProperties): string {
    const row = (k: string, v: string | null | undefined) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : "");
    const coverage = p.best_source
      ? `${esc(p.best_source)} : ${esc(t(`config.methodo.tidal.precision.${p.coverage_class}`))}`
      : esc(t("config.methodo.tidal.pass.coverageNone"));
    const candidates = p.candidates?.length ? p.candidates.map(esc).join("<br>") : esc(t("config.methodo.tidal.popup.none"));
    return (
      `<h3 class="methodo-map-popup-title">${esc(p.name)}</h3><dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.pass.published"), p.max_spring_text ? `${esc(p.max_spring_text)} kt` : null) +
      row(t("config.methodo.tidal.pass.confidence"), esc(p.confidence)) +
      row(t("config.methodo.tidal.pass.coverage"), coverage) +
      row(t("config.methodo.tidal.popup.candidates"), candidates) +
      row(t("config.methodo.tidal.popup.objective"), esc(t(p.in_objective ? "config.methodo.tidal.popup.yes" : "config.methodo.tidal.popup.no"))) +
      row(t("config.methodo.tidal.pass.reference"), p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(p.source_url.replace(/^https?:\/\//, "").slice(0, 40))}</a>` : null) +
      `</dl>`
    );
  }

  function sourcePopup(p: SourceFC["features"][number]["properties"]): string {
    const row = (k: string, v: string | null | undefined) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : "");
    const status = COLOR[p.status as keyof typeof COLOR] ?? "#999";
    return (
      `<h3 class="methodo-map-popup-title">${esc(p.name)}</h3>` +
      `<span class="methodo-map-badge" style="background:${status}">${esc(t(`config.methodo.tidal.source.status.${p.status}` as Parameters<typeof t>[0]))}</span>` +
      `<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.source.resolution"), p.resolution_m ? `${esc(p.resolution_m)} m` : null) +
      row(t("config.methodo.tidal.source.access"), esc(p.access)) +
      row(
        t("config.methodo.tidal.source.licence"),
        `<a href="${esc(p.licence_url)}" target="_blank" rel="noopener">${esc(p.licence)}</a> <small>(${esc(t("config.methodo.tidal.source.readAt", { date: p.licence_read_at }))})</small>`,
      ) +
      `</dl>`
    );
  }

  // The card for a click: the server's own answer for the point, framed
  // by what the static layers know about it.
  async function clickPopup(lat: number, lon: number): Promise<string> {
    const d = dataRef.current;
    const row = (k: string, v: string | null | undefined) => (v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : "");
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
    const near = nearestPass(lat, lon, d?.passes ?? null);
    const spike = d?.spike.features.find((f) => pointInGeometry(lon, lat, f.geometry));
    const inObjective = d?.objective.features.some((f) => pointInGeometry(lon, lat, f.geometry)) ?? false;
    const candidates = (d?.sources.features ?? [])
      .filter((f) => f.properties.status === "ok" && f.properties.kind !== "station_points" && pointInGeometry(lon, lat, f.geometry))
      .sort((a, b) => (a.properties.resolution_m ?? 1e9) - (b.properties.resolution_m ?? 1e9))
      .slice(0, 3)
      .map((f) => `${esc(f.properties.name)}${f.properties.resolution_m ? ` (${f.properties.resolution_m} m)` : ""}`);
    const badge = precision
      ? `<span class="methodo-map-badge" style="background:${precision === "global" ? COLOR.gap : precision === "coarse" ? COLOR.clarify : COLOR.ok}">${esc(t(`config.methodo.tidal.precision.${precision}`))}</span>`
      : "";
    return (
      `<h3 class="methodo-map-popup-title">${esc(t("config.methodo.tidal.popup.title"))}</h3>${badge}<dl class="methodo-map-popup-grid">` +
      row(t("config.methodo.tidal.popup.source"), answerHtml) +
      row(t("config.methodo.tidal.popup.current"), esc(t(`config.methodo.tidal.current.${band}`))) +
      row(t("config.methodo.tidal.layer.spike"), spike ? `<code>${esc(spike.properties.label)}</code>` : null) +
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
      const popup = L.popup({ maxWidth: 360, className: "methodo-map-popup" })
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
        const canvas = L.canvas({ padding: 0.5 });
        const built: Partial<Record<LayerKey, L.Layer>> = {};
        for (const f of d.masks.features) {
          const key: LayerKey = f.properties.threshold_kt >= 1.5 ? "mask15" : "mask05";
          const color = COLOR[key];
          built[key] = L.geoJSON(f as Feature, { style: { color, weight: 0.6, fillColor: color, fillOpacity: 0.35, interactive: false } });
        }
        const covered = d.passes.features.filter((f) => !isGap(f));
        built.passes = L.geoJSON({ type: "FeatureCollection", features: covered } as PassFC, {
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: passRadius((f as Feature<Point, PassProperties>).properties), color: COLOR.pass, weight: 1, fillColor: COLOR.pass, fillOpacity: 0.55 }),
          onEachFeature: (f, l) => l.bindPopup(passPopup((f as Feature<Point, PassProperties>).properties), { maxWidth: 360, className: "methodo-map-popup" }),
        });
        for (const k of ["fine", "medium", "coarse"] as const) {
          const feats = d.classes.features.filter((f) => f.properties.class === k);
          built[k] = L.geoJSON({ type: "FeatureCollection", features: feats } as ClassFC, {
            style: { color: COLOR[k], weight: 0.8, fillColor: COLOR[k], fillOpacity: k === "coarse" ? 0.22 : 0.4, interactive: false },
          });
        }
        built.shom = L.layerGroup(
          d.shom.points.map(([lat, lon]) => L.circleMarker([lat, lon], { renderer: canvas, radius: 2, weight: 0, fillColor: COLOR.fine, fillOpacity: 0.7, interactive: false })),
        );
        built.spike = L.geoJSON(d.spike, { style: { color: COLOR.spike, weight: 2, dashArray: "5 4", fillColor: COLOR.spike, fillOpacity: 0.08, interactive: false } });
        built.objective = L.geoJSON(d.objective, { style: { color: COLOR.objective, weight: 1.5, dashArray: "8 6", fill: false, interactive: false } });
        built.gapMask = L.geoJSON(d.gapMask, { style: { color: COLOR.gap, weight: 0.8, fillColor: COLOR.gap, fillOpacity: 0.45, interactive: false } });
        const uncovered = d.passes.features.filter((f) => isGap(f) && f.properties.in_objective);
        built.gapPasses = L.geoJSON({ type: "FeatureCollection", features: uncovered } as PassFC, {
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: passRadius((f as Feature<Point, PassProperties>).properties) + 1, color: COLOR.gap, weight: 3, fillColor: "#ffffff", fillOpacity: 0.9 }),
          onEachFeature: (f, l) => l.bindPopup(passPopup((f as Feature<Point, PassProperties>).properties), { maxWidth: 360, className: "methodo-map-popup" }),
        });
        built.sources = L.geoJSON(d.sources, {
          style: (f) => {
            const status = (f?.properties as SourceFC["features"][number]["properties"] | undefined)?.status ?? "ok";
            const color = COLOR[status as keyof typeof COLOR] ?? "#999";
            return { color, weight: 1.5, dashArray: status === "blocked" ? "4 4" : undefined, fillColor: color, fillOpacity: 0.06 };
          },
          onEachFeature: (f, l) => l.bindPopup(sourcePopup((f as SourceFC["features"][number]).properties), { maxWidth: 360, className: "methodo-map-popup" }),
        });
        layersRef.current = built;
        for (const k of LAYER_KEYS) if (visible[k] && built[k]) built[k]!.addTo(map);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
    // The map is created once; `visible` and `t` are read through refs and
    // the module-level store at event time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const k of LAYER_KEYS) {
      const layer = layersRef.current[k];
      if (!layer) continue;
      if (visible[k]) layer.addTo(map);
      else map.removeLayer(layer);
    }
  }, [visible, status]);

  const toggle = (k: LayerKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const swatch = (style: string, round = false) => <span className={`methodo-map-swatch${round ? " is-round" : ""}`} style={{ background: style }} />;
  const item = (k: LayerKey, label: string, sw: ReactElement) => (
    <label className="methodo-map-item" key={k}>
      <input type="checkbox" id={`tidal-layer-${k}`} checked={visible[k]} onChange={() => toggle(k)} />
      {sw}
      <span>{label}</span>
    </label>
  );

  return (
    <figure className="methodo-map">
      <p className="methodo-map-hint">{t("config.methodo.tidal.hint")}</p>
      <div ref={containerRef} className="methodo-map-canvas" role="application" aria-busy={status === "loading"} />
      <div className="methodo-map-legend">
        <div className="methodo-map-group">
          <div className="methodo-map-group-title">{t("config.methodo.tidal.legend.current")}</div>
          {item("mask05", t("config.methodo.tidal.layer.mask05"), swatch(COLOR.mask05))}
          {item("mask15", t("config.methodo.tidal.layer.mask15"), swatch(COLOR.mask15))}
          {item("passes", t("config.methodo.tidal.layer.passes"), swatch(COLOR.pass, true))}
        </div>
        <div className="methodo-map-group">
          <div className="methodo-map-group-title">{t("config.methodo.tidal.legend.coverage")}</div>
          {item("shom", t("config.methodo.tidal.layer.shom"), swatch(COLOR.fine, true))}
          {item("fine", t("config.methodo.tidal.layer.fine"), swatch(COLOR.fine))}
          {item("medium", t("config.methodo.tidal.layer.medium"), swatch(COLOR.medium))}
          {item("coarse", t("config.methodo.tidal.layer.coarse"), swatch(COLOR.coarse))}
          {item("spike", t("config.methodo.tidal.layer.spike"), <span className="methodo-map-swatch is-dashed" style={{ borderColor: COLOR.spike }} />)}
        </div>
        <div className="methodo-map-group">
          <div className="methodo-map-group-title">{t("config.methodo.tidal.legend.gaps")}</div>
          {item("objective", t("config.methodo.tidal.layer.objective"), <span className="methodo-map-swatch is-dashed" style={{ borderColor: COLOR.objective }} />)}
          {item("gapMask", t("config.methodo.tidal.layer.gapMask"), swatch(COLOR.gap))}
          {item("gapPasses", t("config.methodo.tidal.layer.gapPasses"), <span className="methodo-map-swatch is-round" style={{ background: "#fff", border: `3px solid ${COLOR.gap}` }} />)}
          {item("sources", t("config.methodo.tidal.layer.sources"), swatch(COLOR.ok))}
        </div>
      </div>
      <figcaption className="methodo-map-note">
        {status === "error" ? t("config.methodo.tidal.popup.error") : t("config.methodo.tidal.note")}
      </figcaption>
    </figure>
  );
}

export default TidalSourcesMap;
