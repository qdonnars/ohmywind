// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export interface PlanWaypoint {
  lat: number;
  lon: number;
}

export interface SegmentReport {
  start: PlanWaypoint;
  end: PlanWaypoint;
  distance_nm: number;
  bearing_deg: number;
  start_time: string;
  end_time: string;
  tws_kn: number;
  twd_deg: number;
  twa_deg: number;
  polar_speed_kn: number;
  boat_speed_kn: number;
  duration_h: number;
  hs_m: number | null;
  wave_derate_factor: number;
  current_speed_kn?: number | null;
  current_direction_to_deg?: number | null;
  sog_kn?: number | null;
  current_source?: string | null;
  gust_kn?: number | null;
  wave_period_s?: number | null;
  motor_used?: boolean;
}

/**
 * A warning as the server codes it. `plan.notice.<code>` is its key in the
 * dictionaries and `params` fill that entry; `message` is the server's own
 * French sentence, shown when the code is one this build does not know (an
 * older app meeting a newer server) or when an older server sent none.
 * The values are display strings or counts, never formatted again here.
 */
export interface Notice {
  code: string;
  params: Record<string, string | number>;
  message: string;
}

export interface PassageReport {
  archetype: string;
  departure_time: string;
  arrival_time: string;
  duration_h: number;
  distance_nm: number;
  efficiency: number;
  model: string;
  segments: SegmentReport[];
  warnings: string[];
  /** `warnings`, one for one, as notices. Absent from an older server. */
  notices?: Notice[];
}

export interface ComplexityWarning {
  kind: "wind" | "sea" | "current" | "chop";
  level: number;
  message: string;
  affected_segments: number[];
  /** The notice behind `message`; absent from an older server. */
  code?: string;
  params?: Record<string, string | number>;
}

export interface ComplexityScore {
  level: number;
  label: string;
  wind_level: number;
  wind_label: string;
  sea_level: number | null;
  sea_label: string | null;
  tws_max_kn: number;
  hs_max_m: number | null;
  rationale: string;
  warnings?: ComplexityWarning[];
}

export interface PassageResponse {
  passage: PassageReport;
  complexity: ComplexityScore;
  forecast_updated_at: string;
}

// ── ETA-driven mode (target arrival, solve for departure) ────────────────────

export interface EtaSolveMeta {
  target_arrival: string;       // ISO-8601 UTC
}

export interface PassageByEtaResponse extends PassageResponse {
  eta: EtaSolveMeta;
}

// ── Sweep mode (compare-windows) ─────────────────────────────────────────────

export type SailAngle = "pres" | "travers" | "largue" | "portant";

export interface ConditionsSummary {
  tws_min_kn: number;
  tws_max_kn: number;
  predominant_sail_angle: SailAngle;
  hs_min_m: number | null;
  hs_max_m: number | null;
}

export interface PassageWindow {
  departure: string;
  arrival: string;
  duration_h: number;
  distance_nm: number;
  complexity: {
    level: number;
    label: string;
    tws_max_kn: number;
    rationale: string;
  };
  conditions_summary: ConditionsSummary;
  warnings: string[];
  /** `warnings` as notices, the passage's then the score's. Absent from an
      older server. */
  notices?: Notice[];
  // Full per-window detail for instant drill-down (no re-fetch). Optional
  // because older HF Space deployments may still serve responses without
  // these fields — frontend must fall back to fetching when missing.
  passage?: PassageReport;
  complexity_full?: ComplexityScore;
}

export interface MultiWindowResponse {
  mode: "multi_window";
  sweep: {
    earliest: string;
    latest: string;
    interval_hours: number;
    window_count: number;
  };
  windows: PassageWindow[];
  meta_warnings: string[];
  /** `meta_warnings` as notices. The parser fills it from the sentences when
      an older server sends none, so it is always there to render. */
  meta_notices: Notice[];
  forecast_updated_at: string;
}

export type PassageOrSweepResponse = PassageResponse | MultiWindowResponse;

export function isMultiWindow(r: PassageOrSweepResponse): r is MultiWindowResponse {
  return (r as MultiWindowResponse).mode === "multi_window";
}

export interface Archetype {
  slug: string;
  name: string;
  length_ft: number;
  type: string;
  category: string;
  examples: string[];
  performance_class: string;
}

