// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The border between the server's JSON and the app's types.
 *
 * Until now the three passage endpoints ended in `res.json() as Promise<T>`:
 * a cast, which asserts a shape rather than checking it (annexe B, M3). A body
 * from a deployment mid-rollout, an HTML error page served with the wrong
 * content type, or a proxy that swallowed a field all reached the components
 * as a `PassageReport`, and the failure surfaced somewhere far away, as
 * `Cannot read properties of undefined (reading 'map')`.
 *
 * The checks below are deliberately *structural and light*: required fields
 * with the right primitive kind, arrays that are arrays. Nothing about values,
 * no schema library, no runtime cost worth measuring. What they buy is that a
 * malformed body fails here, once, with a message naming the field, and the
 * user sees the error panel instead of a blank page.
 *
 * Optional fields stay optional: they mark capabilities a given deployment may
 * not have yet (per-window detail, currents, gusts), and rejecting a body for
 * missing one would break the compatibility the callers already handle.
 */

import type {
  PassageResponse,
  PassageByEtaResponse,
  MultiWindowResponse,
  PassageReport,
  ComplexityScore,
  PassageWindow,
  SegmentReport,
  Archetype,
} from "../plan/types";

/**
 * A body that is not the contract.
 *
 * Distinct from the `Error` a non-OK status produces: that one carries the
 * server's own words, this one means the server answered 200 with something
 * nobody can use. `friendlyError` maps it to a single French sentence.
 */
export class ApiShapeError extends Error {
  /** Dotted path of the first field that did not check out. */
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`réponse inattendue du serveur (${path}: ${detail})`);
    this.name = "ApiShapeError";
    this.path = path;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireRecord(v: unknown, path: string): Record<string, unknown> {
  if (!isRecord(v)) throw new ApiShapeError(path, "objet attendu");
  return v;
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ApiShapeError(path, "nombre fini attendu");
  }
  return v;
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== "string") throw new ApiShapeError(path, "chaîne attendue");
  return v;
}

function requireArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new ApiShapeError(path, "tableau attendu");
  return v;
}

function requireStringArray(v: unknown, path: string): string[] {
  const array = requireArray(v, path);
  array.forEach((item, i) => requireString(item, `${path}[${i}]`));
  return array as string[];
}

function parseSegment(v: unknown, path: string): SegmentReport {
  const s = requireRecord(v, path);
  const start = requireRecord(s.start, `${path}.start`);
  const end = requireRecord(s.end, `${path}.end`);
  requireNumber(start.lat, `${path}.start.lat`);
  requireNumber(start.lon, `${path}.start.lon`);
  requireNumber(end.lat, `${path}.end.lat`);
  requireNumber(end.lon, `${path}.end.lon`);
  requireNumber(s.distance_nm, `${path}.distance_nm`);
  requireNumber(s.bearing_deg, `${path}.bearing_deg`);
  requireString(s.start_time, `${path}.start_time`);
  requireString(s.end_time, `${path}.end_time`);
  requireNumber(s.tws_kn, `${path}.tws_kn`);
  requireNumber(s.twd_deg, `${path}.twd_deg`);
  requireNumber(s.twa_deg, `${path}.twa_deg`);
  requireNumber(s.boat_speed_kn, `${path}.boat_speed_kn`);
  requireNumber(s.duration_h, `${path}.duration_h`);
  // `hs_m` is null wherever the marine model has no coverage, by design.
  if (s.hs_m !== null && typeof s.hs_m !== "number") {
    throw new ApiShapeError(`${path}.hs_m`, "nombre ou null attendu");
  }
  return s as unknown as SegmentReport;
}

export function parsePassageReport(v: unknown, path = "passage"): PassageReport {
  const p = requireRecord(v, path);
  requireString(p.archetype, `${path}.archetype`);
  requireString(p.departure_time, `${path}.departure_time`);
  requireString(p.arrival_time, `${path}.arrival_time`);
  requireNumber(p.duration_h, `${path}.duration_h`);
  requireNumber(p.distance_nm, `${path}.distance_nm`);
  requireNumber(p.efficiency, `${path}.efficiency`);
  requireString(p.model, `${path}.model`);
  requireArray(p.segments, `${path}.segments`).forEach((s, i) =>
    parseSegment(s, `${path}.segments[${i}]`),
  );
  requireStringArray(p.warnings, `${path}.warnings`);
  return p as unknown as PassageReport;
}

export function parseComplexityScore(v: unknown, path = "complexity"): ComplexityScore {
  const c = requireRecord(v, path);
  requireNumber(c.level, `${path}.level`);
  requireString(c.label, `${path}.label`);
  requireNumber(c.wind_level, `${path}.wind_level`);
  requireString(c.wind_label, `${path}.wind_label`);
  requireNumber(c.tws_max_kn, `${path}.tws_max_kn`);
  requireString(c.rationale, `${path}.rationale`);
  // `warnings` is optional: it only appears once something is worth saying.
  if (c.warnings !== undefined) {
    requireArray(c.warnings, `${path}.warnings`).forEach((w, i) => {
      const warning = requireRecord(w, `${path}.warnings[${i}]`);
      requireString(warning.message, `${path}.warnings[${i}].message`);
    });
  }
  return c as unknown as ComplexityScore;
}

function parseWindow(v: unknown, path: string): PassageWindow {
  const w = requireRecord(v, path);
  requireString(w.departure, `${path}.departure`);
  requireString(w.arrival, `${path}.arrival`);
  requireNumber(w.duration_h, `${path}.duration_h`);
  requireNumber(w.distance_nm, `${path}.distance_nm`);
  const complexity = requireRecord(w.complexity, `${path}.complexity`);
  requireNumber(complexity.level, `${path}.complexity.level`);
  requireString(complexity.label, `${path}.complexity.label`);
  requireRecord(w.conditions_summary, `${path}.conditions_summary`);
  requireStringArray(w.warnings, `${path}.warnings`);
  // Per-window detail is optional: older deployments answer without it and the
  // drill-down falls back to a computation.
  if (w.passage !== undefined) parsePassageReport(w.passage, `${path}.passage`);
  if (w.complexity_full !== undefined) {
    parseComplexityScore(w.complexity_full, `${path}.complexity_full`);
  }
  return w as unknown as PassageWindow;
}

export function parsePassageResponse(body: unknown): PassageResponse {
  const b = requireRecord(body, "réponse");
  return {
    passage: parsePassageReport(b.passage),
    complexity: parseComplexityScore(b.complexity),
    forecast_updated_at: requireString(b.forecast_updated_at, "forecast_updated_at"),
  };
}

export function parsePassageByEtaResponse(body: unknown): PassageByEtaResponse {
  const single = parsePassageResponse(body);
  const b = body as Record<string, unknown>;
  const eta = requireRecord(b.eta, "eta");
  return { ...single, eta: { target_arrival: requireString(eta.target_arrival, "eta.target_arrival") } };
}

export function parseMultiWindowResponse(body: unknown): MultiWindowResponse {
  const b = requireRecord(body, "réponse");
  if (b.mode !== "multi_window") {
    throw new ApiShapeError("mode", 'attendu "multi_window"');
  }
  const sweep = requireRecord(b.sweep, "sweep");
  const windows = requireArray(b.windows, "windows").map((w, i) =>
    parseWindow(w, `windows[${i}]`),
  );
  return {
    mode: "multi_window",
    sweep: {
      earliest: requireString(sweep.earliest, "sweep.earliest"),
      latest: requireString(sweep.latest, "sweep.latest"),
      interval_hours: requireNumber(sweep.interval_hours, "sweep.interval_hours"),
      window_count: requireNumber(sweep.window_count, "sweep.window_count"),
    },
    windows,
    meta_warnings: requireStringArray(b.meta_warnings, "meta_warnings"),
    forecast_updated_at: requireString(b.forecast_updated_at, "forecast_updated_at"),
  };
}

/**
 * The boat catalogue. Looser than the rest on purpose: a slug and a name are
 * all the selector needs to stay usable, and an entry the server adds fields
 * to must not empty the list.
 */
export function parseArchetypes(body: unknown): Archetype[] {
  const list = requireArray(body, "archétypes");
  list.forEach((a, i) => {
    const entry = requireRecord(a, `archétypes[${i}]`);
    requireString(entry.slug, `archétypes[${i}].slug`);
    requireString(entry.name, `archétypes[${i}].name`);
  });
  return list as Archetype[];
}
