// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { SegmentReport } from "./types";
import { CURRENT_RELEVANCE_THRESHOLD_KN, SEA_FORMED_HS_M } from "../domain/thresholds";
import { COEFF_DEFAULT } from "../config/polarConfig";

export interface AggregatedLeg {
  // ── Distances & timing (carried from the segment span) ─────────────────────
  distance_nm: number;
  start_time: string;
  end_time: string;

  // ── Wind summary ──────────────────────────────────────────────────────────
  tws_min: number;
  tws_max: number;
  tws_avg_kn: number;
  twa_avg_deg: number; // signed -180..180 like SegmentReport.twa_deg
  twd_avg_deg: number; // 0..360 (true wind direction)
  bearing_avg_deg: number; // 0..360 (boat course, true)
  gust_max_kn: number | null;
  point_of_sail: string;

  // ── Boat speed build-up (all in knots) ────────────────────────────────────
  // Distance-weighted means computed per-segment then averaged, so the
  // build-up adds up exactly: polar_after_eff_kn + wave_delta_kn (≤ 0)
  // ≈ boat_speed_kn, and boat_speed_kn + current_delta_kn = target_speed_kn.
  polar_after_eff_kn: number; // polar lookup × passage efficiency (no waves, no current)
  wave_delta_kn: number; // ≤ 0 — loss from wave_derate
  current_delta_kn: number | null; // signed — gain when along, loss when against; null without current data
  boat_speed_kn: number; // STW (polar × efficiency × derate)
  target_speed_kn: number; // SOG when current modelled, else STW — used for duration
  efficiency: number; // passage-wide constant, for display

  // ── Sea state ─────────────────────────────────────────────────────────────
  hs_avg_m: number | null;
  hs_max_m: number | null;
  tp_avg_s: number | null;
  // Where the sea hits the boat relative to its course: "face", "travers",
  // "arrière", or null if Hs is null. Approximated from TWA (Med swell mostly
  // tracks wind in the absence of distant ocean swell).
  sea_direction: "face" | "travers" | "arrière" | null;

  // ── Current ───────────────────────────────────────────────────────────────
  current_speed_kn: number | null;
  current_direction_to_deg: number | null;
  // Sign of current_delta_kn translated to a sailor-friendly label.
  current_relative: "portant" | "contraire" | "travers" | null;

  // True when more than half of the leg's distance was covered with the
  // engine on (per-segment motor_used aggregated by distance share). Used to
  // override the point-of-sail label with "Moteur" so the user sees at a
  // glance which legs the planner switched away from sailing.
  motor_used: boolean;

  // ── Provenance ────────────────────────────────────────────────────────────
  // Inclusive-exclusive indices into `passage.segments` this summary was
  // built from. A leg spans every server segment between two user waypoints;
  // a step (see `aggregateSteps`) spans exactly one. The map reads it to
  // place the focused step, the panel to list the steps of an open leg.
  segment_range: [number, number];
}

function circularMeanDeg(angles: number[]): number {
  const s = angles.reduce((sum, a) => sum + Math.sin((a * Math.PI) / 180), 0);
  const c = angles.reduce((sum, a) => sum + Math.cos((a * Math.PI) / 180), 0);
  return (((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360;
}

// `minUpwindDeg` is the boat's minimum sailable TWA — below it the direct
// course is in the no-go zone and the planner already bills the leg at the
// tacking speed (`best_vmg_upwind` in passage.py), so the label says so
// instead of a bare "Près" the sailor cannot actually steer. Above the angle
// the boat is genuinely close-hauled. The server tacks from its optimal-VMG
// angle, which sits at or above `minUpwindDeg`, so the qualifier is
// conservative: it never claims tacking where the boat could hold the course.
// Pass 0 to disable the qualifier entirely.
function twaToPointOfSail(twa: number, minUpwindDeg: number): string {
  // twa_deg is signed (-180..180) or unsigned (0..360), normalise to 0-180
  const a = Math.abs(twa) > 180 ? 360 - Math.abs(twa) : Math.abs(twa);
  if (a < minUpwindDeg) return "Près (louvoyage)";
  if (a < 50) return "Près";
  if (a < 90) return "Travers";
  if (a < 135) return "Largue";
  return "Arrière";
}

export function legDurationLabel(leg: AggregatedLeg): string {
  const ms = new Date(leg.end_time).getTime() - new Date(leg.start_time).getTime();
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} mn`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} h`;
  // "1h30" form — compact, no zero-pad on minutes since sailors read "1h05" oddly.
  return `${h}h${m.toString().padStart(2, "0")}`;
}

// Build the leg summary as a list of standalone "cells" — duration,
// allure, plus any qualifiers triggered by the current/wave/wind thresholds.
// Rendered as a flex-wrap row of chips in LegRow so each cell wraps onto a
// new line when the sidebar is narrow.
//
// Sea/wind thresholds match the server-side complexity scorer (Météo-France
// classification) so the summary stays coherent with the warnings the LLM
// surfaces in MCP. Wind-against-current requires both an opposing direction
// AND a material current speed (>= 1.5 kn), mirroring the server cutoff.
//
// Clapot ("steepness" Hs/Tp² > 0.05 with Hs >= 0.8 m) takes precedence over
// the generic "Mer Formée" label because it carries a sharper meaning for the
// sailor — short steep wind sea, not just heavy seas. Long-period swell at
// the same Hs (e.g. Hs 1.8 m at Tp 11 s) keeps the "Mer Formée" label since
// it isn't clapot. Thresholds match the server-side ComplexityWarning kind=
// "chop".
export interface LegSummaryCells {
  duration: string;
  allure: string;
  wind: string;
  // Single optional flag cell — covers either sea state (Mer Formée / Grosse
  // Mer / Clapot) or wind-against-current. When both fire on a leg, current
  // wins because it's the rarer and more decision-shaping signal. Null =
  // empty cell, kept in the grid so columns line up vertically across rows.
  flag: string | null;
}

// Build the leg summary as a fixed set of named cells so LegRow can render
// them in a CSS grid with stable column positions (each leg's duration sits
// under the previous leg's duration, etc.). Returning a positional string[]
// here used to drift on narrow viewports — the wrapping reordered cells.
export function buildLegSummaryCells(leg: AggregatedLeg): LegSummaryCells {
  const tMin = Math.round(leg.tws_min);
  const tMax = Math.round(leg.tws_max);
  // NBSP between the number and "kn" so the wind chip stays on one line when
  // SummaryCell renders with width:min-content. Multi-word labels (Mer Formée,
  // Vent Contre Courant) still break at their normal spaces. Spelled as an
  // escape: a raw NBSP is invisible in review and reads as a stray space, so
  // no-irregular-whitespace rejects it.
  const wind = tMin === tMax ? `${tMin}\u00a0kn` : `${tMin}–${tMax}\u00a0kn`;

  const chopIndex =
    leg.hs_avg_m != null && leg.tp_avg_s != null && leg.tp_avg_s > 0
      ? leg.hs_avg_m / (leg.tp_avg_s * leg.tp_avg_s)
      : null;

  let flag: string | null = null;
  if (leg.current_relative === "contraire" && (leg.current_speed_kn ?? 0) >= 1.5) {
    flag = "Vent Contre Courant";
  } else if (leg.hs_avg_m != null) {
    if (leg.hs_avg_m > 2.5) flag = "Grosse Mer";
    else if (chopIndex != null && chopIndex > 0.05 && leg.hs_avg_m >= 0.8) {
      // Following sea (TWA >= 120°): the chop is uncomfortable but doesn't
      // bump complexity server-side either. We rename the chip rather than
      // hide it because broaching / accidental gybe risks remain.
      flag = leg.sea_direction === "arrière" ? "Clapot Suiveur" : "Clapot";
    }
    else if (leg.hs_avg_m > SEA_FORMED_HS_M) flag = "Mer Formée";
  }

  return {
    duration: legDurationLabel(leg),
    // Short allure ("Près" / "Travers" / "Largue" / "Arrière", or the
    // "Près (louvoyage)" qualifier) — SummaryCell renders at width:min-content
    // and breaks on spaces, so the two-word form wraps inside the column
    // rather than widening it, like "Mer Formée" already does. The one-word
    // forms match the WindowsTable ALLURE column copy.
    allure: leg.point_of_sail,
    wind,
    flag,
  };
}

// Inclusive-exclusive segment ranges per user-waypoint leg. Shared between
// the sidebar (drives the click-to-expand list) and the map (drives the
// highlight overlay when a leg is selected).
export function computeLegSegmentRanges(
  segments: { start: { lat: number; lon: number } }[],
  waypoints: [number, number][],
): Array<[number, number]> {
  if (waypoints.length < 2 || segments.length === 0) return [];
  const legStarts: number[] = [0];
  for (let w = 1; w < waypoints.length - 1; w++) {
    const [wlat, wlon] = waypoints[w];
    let best = legStarts[legStarts.length - 1] + 1;
    let bestD = Infinity;
    for (let i = best; i < segments.length; i++) {
      const d = Math.hypot(segments[i].start.lat - wlat, segments[i].start.lon - wlon);
      if (d < bestD) { bestD = d; best = i; }
    }
    legStarts.push(best);
  }
  legStarts.push(segments.length);
  return legStarts.slice(0, -1).map((s, i) => [s, legStarts[i + 1]]);
}

/**
 * Passage-wide index of the step open in the panel, or null when nothing is
 * open. Null too when the step falls past its leg: the reducer drops the
 * step with the leg, so a range and a step that disagree can only be a stale
 * index past a shorter leg, better ignored than drawn on the next leg.
 */
export function focusedSegmentIndex(
  ranges: Array<[number, number]>,
  legIdx: number | null,
  stepIdx: number | null,
): number | null {
  if (legIdx == null || stepIdx == null) return null;
  const range = ranges[legIdx];
  if (!range) return null;
  const idx = range[0] + stepIdx;
  return idx < range[1] ? idx : null;
}

function twaToSeaDirection(twa: number): "face" | "travers" | "arrière" {
  // 3-bucket split (vs 4 for point_of_sail) — sailors call out sea state in
  // coarser terms than sail trim.
  const a = Math.abs(twa) > 180 ? 360 - Math.abs(twa) : Math.abs(twa);
  if (a < 60) return "face";
  if (a < 120) return "travers";
  return "arrière";
}

function classifyCurrent(deltaKn: number, currentSpeedKn: number | null): "portant" | "contraire" | "travers" {
  // |delta| / current_speed ~ |cos(angle)|. > 0.5 → mostly along (portant or contraire); < 0.5 → mostly travers.
  if (currentSpeedKn != null && currentSpeedKn > 0 && Math.abs(deltaKn) / currentSpeedKn < 0.5) return "travers";
  return deltaKn >= 0 ? "portant" : "contraire";
}

/**
 * Summarise one run of consecutive server segments as an `AggregatedLeg`.
 *
 * Distance-weighted means throughout, so a long calm segment outweighs a
 * short gusty one, and the speed build-up adds up. `range` is only carried
 * through for provenance. Returns null for an empty or zero-length run.
 */
export function aggregateSegments(
  segs: SegmentReport[],
  efficiency: number,
  minUpwindDeg: number,
  range: [number, number],
): AggregatedLeg | null {
  if (segs.length === 0) return null;
  const totalDist = segs.reduce((s, seg) => s + seg.distance_nm, 0);
  if (totalDist <= 0) return null;
  const wsum = (pick: (s: SegmentReport) => number): number =>
    segs.reduce((acc, seg) => acc + pick(seg) * seg.distance_nm, 0) / totalDist;

  // Wind aggregates
  const twsVals = segs.map((s) => s.tws_kn);
  const tws_avg_kn = wsum((s) => s.tws_kn);
  const twa_avg_deg = circularMeanDeg(segs.map((s) => s.twa_deg));
  const twd_avg_deg = circularMeanDeg(segs.map((s) => s.twd_deg));
  const bearing_avg_deg = circularMeanDeg(segs.map((s) => s.bearing_deg));
  const gusts = segs.map((s) => s.gust_kn).filter((g): g is number => g != null);
  const gust_max_kn = gusts.length > 0 ? Math.max(...gusts) : null;

  // Speed build-up (per-segment, then weighted averaged so the additions stay coherent)
  const polar_after_eff_kn = wsum((s) => s.polar_speed_kn * efficiency);
  const boat_speed_kn = wsum((s) => s.boat_speed_kn);
  const wave_delta_kn = boat_speed_kn - polar_after_eff_kn; // ≤ 0

  // Current — only if every segment in the leg has SOG (avoid mixing)
  const allHaveSog = segs.every((s) => s.sog_kn != null);
  const current_delta_kn = allHaveSog ? wsum((s) => (s.sog_kn as number) - s.boat_speed_kn) : null;
  const target_speed_kn = allHaveSog ? wsum((s) => s.sog_kn as number) : boat_speed_kn;

  // Current speed/direction (max speed for "worst case", circular mean direction)
  const curSpeeds = segs.map((s) => s.current_speed_kn).filter((v): v is number => v != null);
  const current_speed_kn = curSpeeds.length > 0 ? Math.max(...curSpeeds) : null;
  const curDirs = segs.map((s) => s.current_direction_to_deg).filter((v): v is number => v != null);
  const current_direction_to_deg = curDirs.length > 0 ? circularMeanDeg(curDirs) : null;
  const current_relative = current_delta_kn != null
    ? classifyCurrent(current_delta_kn, current_speed_kn)
    : null;

  // Sea state
  const hsSegs = segs.filter((s) => s.hs_m != null);
  const hsTotalDist = hsSegs.reduce((s, seg) => s + seg.distance_nm, 0);
  const hs_avg_m = hsTotalDist > 0
    ? hsSegs.reduce((s, seg) => s + (seg.hs_m as number) * seg.distance_nm, 0) / hsTotalDist
    : null;
  const hs_max_m = hsSegs.length > 0 ? Math.max(...hsSegs.map((s) => s.hs_m as number)) : null;
  const tpSegs = segs.filter((s) => s.wave_period_s != null);
  const tpTotalDist = tpSegs.reduce((s, seg) => s + seg.distance_nm, 0);
  const tp_avg_s = tpTotalDist > 0
    ? tpSegs.reduce((s, seg) => s + (seg.wave_period_s as number) * seg.distance_nm, 0) / tpTotalDist
    : null;

  // Motor share. Distance-weighted so a single short motor segment in an
  // otherwise sail-driven leg doesn't flip the whole label. Threshold > 0.5
  // matches the product decision (majoritaire); under that, the leg keeps
  // its sailing allure even if a couple of segments were motored through.
  const motorDist = segs.reduce(
    (acc, s) => acc + (s.motor_used ? s.distance_nm : 0),
    0,
  );
  const motor_used = motorDist / totalDist > 0.5;

  return {
    distance_nm: totalDist,
    start_time: segs[0].start_time,
    end_time: segs[segs.length - 1].end_time,
    tws_min: Math.min(...twsVals),
    tws_max: Math.max(...twsVals),
    tws_avg_kn,
    twa_avg_deg,
    twd_avg_deg,
    bearing_avg_deg,
    gust_max_kn,
    point_of_sail: motor_used ? "Moteur" : twaToPointOfSail(twa_avg_deg, minUpwindDeg),
    polar_after_eff_kn,
    wave_delta_kn,
    current_delta_kn,
    boat_speed_kn,
    target_speed_kn,
    efficiency,
    hs_avg_m,
    hs_max_m,
    tp_avg_s,
    sea_direction: hs_avg_m == null ? null : twaToSeaDirection(twa_avg_deg),
    current_speed_kn,
    current_direction_to_deg,
    current_relative,
    motor_used,
    segment_range: range,
  };
}

/**
 * One summary per user-waypoint leg.
 *
 * Empty leg ranges are skipped rather than emitted with garbage: they happen
 * when waypoints have grown beyond the rendered route (a waypoint added past
 * the destination before recomputing), and dereferencing `segs[0]` there used
 * to crash the page.
 */
export function aggregateLegs(
  segments: SegmentReport[],
  waypoints: [number, number][],
  efficiency = COEFF_DEFAULT,
  minUpwindDeg = 0,
): AggregatedLeg[] {
  return computeLegSegmentRanges(segments, waypoints).flatMap(([s, e]) => {
    const leg = aggregateSegments(segments.slice(s, e), efficiency, minUpwindDeg, [s, e]);
    return leg ? [leg] : [];
  });
}

/**
 * The steps of a leg: one `AggregatedLeg` per server segment in `range`, so
 * the panel can show a single sampling point with the exact same shape, and
 * the same code, as the leg average. A step's min and max collapse onto its
 * one value, its "max current" is its current, and so on.
 */
export function aggregateSteps(
  segments: SegmentReport[],
  range: [number, number],
  efficiency: number,
  minUpwindDeg: number,
): AggregatedLeg[] {
  const [s, e] = range;
  const out: AggregatedLeg[] = [];
  for (let i = Math.max(0, s); i < Math.min(e, segments.length); i++) {
    const step = aggregateSegments([segments[i]], efficiency, minUpwindDeg, [i, i + 1]);
    if (step) out.push(step);
  }
  return out;
}

// ── Spread across the steps of a leg ──────────────────────────────────────────
// What the average hides. A leg's compass draws one wind arrow at the mean
// direction; when the steps disagree (a thermal shift, a tide turning
// mid-leg) that arrow points somewhere the wind never blew from. The arcs
// below are what the diagram shades around the mean so the reader can see
// the disagreement instead of trusting a single needle.

/** Under this angular width the steps agree: no arc is drawn. */
const SPREAD_MIN_DEG = 10;

export interface LegSpread {
  step_count: number;
  /** Clockwise arc `[from, to]` in true degrees covering every step's wind
      direction, null when they agree within `SPREAD_MIN_DEG`. */
  twd_arc: [number, number] | null;
  /** Same for the set of the current, counting only steps whose current is
      strong enough to be reported at all. */
  current_arc: [number, number] | null;
  /** Min and max of the per-step mean wave height, null without sea data. */
  hs_range: [number, number] | null;
  /** Min and max of the per-step current speed, null without current data. */
  current_speed_range: [number, number] | null;
}

/** Smallest clockwise arc around the circular mean that contains every
    angle, or null when it is narrower than `SPREAD_MIN_DEG`. */
function arcAround(angles: number[]): [number, number] | null {
  if (angles.length < 2) return null;
  const mean = circularMeanDeg(angles);
  const deltas = angles.map((a) => ((a - mean + 540) % 360) - 180);
  const lo = Math.min(...deltas);
  const hi = Math.max(...deltas);
  if (hi - lo < SPREAD_MIN_DEG) return null;
  const norm = (d: number) => ((d % 360) + 360) % 360;
  return [norm(mean + lo), norm(mean + hi)];
}

function minMax(values: number[]): [number, number] | null {
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}

export function legSpread(steps: AggregatedLeg[]): LegSpread {
  const currentSteps = steps.filter(
    (s) =>
      s.current_direction_to_deg != null &&
      (s.current_speed_kn ?? 0) >= CURRENT_RELEVANCE_THRESHOLD_KN,
  );
  return {
    step_count: steps.length,
    twd_arc: arcAround(steps.map((s) => s.twd_avg_deg)),
    current_arc: arcAround(currentSteps.map((s) => s.current_direction_to_deg as number)),
    hs_range: minMax(steps.map((s) => s.hs_avg_m).filter((v): v is number => v != null)),
    current_speed_range: minMax(
      steps.map((s) => s.current_speed_kn).filter((v): v is number => v != null),
    ),
  };
}
