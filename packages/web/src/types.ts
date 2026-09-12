// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export interface Spot {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface HourlyData {
  time: string[];
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  weather_code: (number | null)[];
  is_day?: (number | null)[];
}

export interface ModelForecast {
  modelName: string;
  hourly: HourlyData;
  // When set, the slot was originally requested for ``fellBackFrom`` but that
  // model returned no data for this spot (typical: AROME queried at Danish
  // coast). The fetch layer walked the user's full priority order to find a
  // model that does cover, and substituted it. The UI surfaces a small badge
  // so the user understands why an "Ignoré" model appears in their table.
  fellBackFrom?: string;
}

export interface MarineHourly {
  time: string[];
  wave_height_m: (number | null)[];
  wave_period_s: (number | null)[];
  wave_direction_deg: (number | null)[];
  current_speed_kn: (number | null)[];
  current_direction_to_deg: (number | null)[];
  // Tide height in MSL reference (Open-Meteo SMOC). Always populated when SMOC
  // covers the spot. Negative values are normal (water below mean sea level).
  tide_height_m: (number | null)[];
  // Tide height in ZH (Zéro Hydrographique / chart datum) reference. Populated
  // only when MARC PREVIMER covers the spot. Always ≥ 0 by construction (chart
  // datum is the lowest astronomical tide), so it matches what nautical charts,
  // SHOM annuals and tide gauges display.
  tide_height_zh_m?: (number | null)[];
  // Z0 used to convert tide_height_m → tide_height_zh_m
  // (zh = msl - z0_hydro_m). Single scalar per spot. Present only when MARC
  // covers the spot.
  z0_hydro_m?: number;
  // Provenance of the currents: ``"marc_<atlas>_<resolution>"`` (e.g.
  // ``marc_finis_250m``) when MARC overrides, ``"shom_c2d_<atlas>_<zone>"``
  // (e.g. ``shom_c2d_558_morbihan``) when a SHOM Atlas C2D point lies within
  // 500 m. Absent on the plain Open-Meteo path: the web never sees the
  // ``"openmeteo_smoc"`` label, which only the passage engine emits per leg.
  // Read by the caption under the currents table (domain/currentSource).
  current_source?: string;
  // Distance in km to the SHOM C2D point actually sampled, when SHOM is the
  // source (always ≤ 0.5 by the cascade rule). Shown in the caption so the
  // user knows how far the value was taken from.
  shom_nearest_km?: number;
  // Resolution in metres of the MARC atlas used (when MARC is the source).
  // Not populated when SHOM is the source — SHOM C2D resolution varies per
  // cartouche and isn't surfaced at this level.
  marc_resolution_m?: number;
  // National tidal coefficient at the start of the displayed window
  // (Brest-anchored, integer in [20, 120]). Surfaced whenever the SHOM
  // registry is loaded on the server side. Null otherwise.
  tide_coefficient?: number | null;
}

export type MetricView = "wind" | "waves" | "tides" | "currents";

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}
