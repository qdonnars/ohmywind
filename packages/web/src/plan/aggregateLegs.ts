import type { SegmentReport } from "./types";

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
}

function circularMeanDeg(angles: number[]): number {
  const s = angles.reduce((sum, a) => sum + Math.sin((a * Math.PI) / 180), 0);
  const c = angles.reduce((sum, a) => sum + Math.cos((a * Math.PI) / 180), 0);
  return (((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360;
}

function twaToPointOfSail(twa: number): string {
  // twa_deg is signed (-180..180) or unsigned (0..360), normalise to 0-180
  const a = Math.abs(twa) > 180 ? 360 - Math.abs(twa) : Math.abs(twa);
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
  // Vent Contre Courant) still break at their normal spaces.
  const wind = tMin === tMax ? `${tMin} kn` : `${tMin}–${tMax} kn`;

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
    else if (leg.hs_avg_m > 1.25) flag = "Mer Formée";
  }

  return {
    duration: legDurationLabel(leg),
    // Bare one-word allure ("Près" / "Travers" / "Largue" / "Arrière") to keep
    // the cell narrow enough for the grid; matches the WindowsTable ALLURE
    // column copy.
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

export function aggregateLegs(
  segments: SegmentReport[],
  waypoints: [number, number][],
  efficiency = 0.75,
): AggregatedLeg[] {
  if (waypoints.length < 2 || segments.length === 0) return [];

  // For each intermediate waypoint, find the segment index that starts there
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

  // Skip empty leg ranges (can happen when waypoints have grown beyond the
  // rendered route, e.g. user adds a waypoint past the destination before
  // recomputing — segments still reflect the old route, so the new leg has
  // no covering segments). Without this guard, segs[0] below dereferences
  // undefined and the page crashes.
  return legStarts.slice(0, -1).flatMap((start, li): AggregatedLeg[] => {
    const segs = segments.slice(start, legStarts[li + 1]);
    if (segs.length === 0) return [];
    const totalDist = segs.reduce((s, seg) => s + seg.distance_nm, 0);
    if (totalDist <= 0) return [];
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

    return [{
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
      point_of_sail: twaToPointOfSail(twa_avg_deg),
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
    }];
  });
}
