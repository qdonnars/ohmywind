import type {
  MarineHourly,
} from "../types";
import {
  CURRENT_RELEVANCE_THRESHOLD_KN,
  TIDE_RANGE_RELEVANCE_THRESHOLD_M,
} from "../types";
import { API_BASE } from "./config";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

// 8 vars on Marine endpoint (waves x5 + currents x2 + tide x1) — under the
// 10-var-per-call cap. Mirrors packages/data-adapters/.../openmeteo.py:_MARINE_VARS.
const MARINE_VARS =
  "wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height," +
  "ocean_current_velocity,ocean_current_direction,sea_level_height_msl";

// Open-Meteo Marine returns ocean_current_velocity in km/h by default.
// 1 nautical mile = 1852 m → 1 kn = 1.852 km/h.
const KMH_TO_KN = 1 / 1.852;

// MARC PREVIMER overlay served by our HF Space wrapper. Returns hourly tide
// + current resampled from harmonic constants when the spot lies inside one
// of the 7 published atlases (ATLNE, MANGA, FINIS, MANW, MANE, SUDBZH, AQUI).
// Outside coverage the response carries ``covered: false`` and we keep the
// Open-Meteo SMOC values.
const MARC_URL = `${API_BASE}/api/v1/marine/marc`;

const cache = new Map<string, { data: MarineHourly; fetchedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

interface RawHourly {
  time?: string[];
  wave_height?: (number | null)[];
  wave_period?: (number | null)[];
  wave_direction?: (number | null)[];
  ocean_current_velocity?: (number | null)[];
  ocean_current_direction?: (number | null)[];
  sea_level_height_msl?: (number | null)[];
}

export interface MarcOverlay {
  covered: boolean;
  current_source?: string;
  atlas_resolution_m?: number;
  z0_hydro_m?: number;
  times?: string[];
  tide_height_m?: (number | null)[];
  current_speed_kn?: (number | null)[];
  current_direction_to_deg?: (number | null)[];
  // National tidal coefficient at the start of the requested window
  // (Brest-anchored, integer in [20, 120]). Surfaced by the server when
  // the SHOM registry has Brest constants loaded; null otherwise.
  tide_coefficient?: number | null;
}

function pad(arr: (number | null)[] | undefined, n: number): (number | null)[] {
  const out: (number | null)[] = new Array(n).fill(null);
  if (!arr) return out;
  for (let i = 0; i < Math.min(arr.length, n); i++) out[i] = arr[i] ?? null;
  return out;
}

// Open-Meteo returns timestamps as Europe/Paris wall-clock with no offset
// suffix (e.g. "2026-05-08T00:00"). MARC returns ISO strings with explicit
// offset. To align them we project both onto UTC ms-since-epoch.
//
// The trick: parse the naive string as if it were UTC, then ask Intl what
// Paris wall-clock would be at that absolute instant. The diff is the Paris
// offset for that day (handles DST without a tz library).
export function parisIsoToUtcMs(parisIso: string): number {
  const asUtc = new Date(parisIso + ":00Z");
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(asUtc)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // Some engines emit "24" at the midnight rollover; coerce to 00.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const parisAsIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = parisAsIfUtc - asUtc.getTime();
  return asUtc.getTime() - offsetMs;
}

async function fetchMarcOverlay(
  lat: number,
  lon: number,
  startUtcIso: string,
  endUtcIso: string,
): Promise<MarcOverlay | null> {
  const url =
    `${MARC_URL}?lat=${lat}&lon=${lon}` +
    `&start=${encodeURIComponent(startUtcIso)}` +
    `&end=${encodeURIComponent(endUtcIso)}` +
    `&step_minutes=60`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as MarcOverlay;
  } catch {
    return null;
  }
}

// Merge MARC overlay into the OM-shaped MarineHourly, index-by-index. Tide
// and current arrays from MARC override SMOC on matching hours; uncovered or
// non-matching hours keep SMOC. Always populates ``tide_height_zh_m`` when
// MARC covers (chart-datum reference, always ≥ 0 — what nautical charts and
// SHOM annuals display).
export function mergeMarcOverlay(
  data: MarineHourly,
  overlay: MarcOverlay | null,
): MarineHourly {
  if (!overlay || !overlay.covered) return data;
  if (
    !overlay.times ||
    !overlay.tide_height_m ||
    !overlay.current_speed_kn ||
    !overlay.current_direction_to_deg
  ) {
    return data;
  }
  const marcIdxByMinuteMs = new Map<number, number>();
  for (let i = 0; i < overlay.times.length; i++) {
    const ms = Date.parse(overlay.times[i]);
    if (Number.isFinite(ms)) {
      marcIdxByMinuteMs.set(Math.floor(ms / 60000) * 60000, i);
    }
  }

  const n = data.time.length;
  const tideMsl = data.tide_height_m.slice();
  const tideZh: (number | null)[] = new Array(n).fill(null);
  const speed = data.current_speed_kn.slice();
  const dirTo = data.current_direction_to_deg.slice();
  const z0 = overlay.z0_hydro_m;

  for (let i = 0; i < n; i++) {
    const utcMs = parisIsoToUtcMs(data.time[i]);
    const key = Math.floor(utcMs / 60000) * 60000;
    const j = marcIdxByMinuteMs.get(key);
    if (j == null) continue;
    const tm = overlay.tide_height_m[j];
    const sp = overlay.current_speed_kn[j];
    const dr = overlay.current_direction_to_deg[j];
    if (tm != null) {
      tideMsl[i] = tm;
      if (z0 != null) tideZh[i] = tm - z0;
    }
    if (sp != null) speed[i] = sp;
    if (dr != null) dirTo[i] = dr;
  }

  return {
    ...data,
    tide_height_m: tideMsl,
    tide_height_zh_m: tideZh,
    current_speed_kn: speed,
    current_direction_to_deg: dirTo,
    z0_hydro_m: z0,
    current_source: overlay.current_source,
    marc_resolution_m: overlay.atlas_resolution_m,
    tide_coefficient: overlay.tide_coefficient ?? null,
  };
}

// 7-day UTC window anchored at "today 00:00 Europe/Paris" — matches the OM
// forecast horizon so MARC and SMOC align hour-for-hour after merge.
function marcWindow(): [string, string] {
  const now = new Date();
  const dayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const startMs = parisIsoToUtcMs(`${dayParis}T00:00`);
  const endMs = startMs + 7 * 24 * 3600 * 1000;
  return [new Date(startMs).toISOString(), new Date(endMs).toISOString()];
}

export async function fetchMarine(lat: number, lon: number): Promise<MarineHourly | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }
  const url =
    `${MARINE_URL}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${MARINE_VARS}&timezone=Europe/Paris&forecast_days=7`;
  const [startIso, endIso] = marcWindow();
  let raw: { hourly?: RawHourly } | null;
  let overlay: MarcOverlay | null = null;
  try {
    const [omResp, marcOverlay] = await Promise.all([
      fetch(url).then(async (r) =>
        r.ok ? ((await r.json()) as { hourly?: RawHourly }) : null,
      ),
      fetchMarcOverlay(lat, lon, startIso, endIso),
    ]);
    if (!omResp) return null;
    raw = omResp;
    overlay = marcOverlay;
  } catch {
    return null;
  }
  const h = raw.hourly;
  if (!h || !h.time) return null;
  const n = h.time.length;
  const baseData: MarineHourly = {
    time: h.time,
    wave_height_m: pad(h.wave_height, n),
    wave_period_s: pad(h.wave_period, n),
    wave_direction_deg: pad(h.wave_direction, n),
    current_speed_kn: pad(h.ocean_current_velocity, n).map((v) =>
      v == null ? null : v * KMH_TO_KN
    ),
    current_direction_to_deg: pad(h.ocean_current_direction, n),
    tide_height_m: pad(h.sea_level_height_msl, n),
  };
  const data = mergeMarcOverlay(baseData, overlay);
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

export function isCurrentsRelevant(marine: MarineHourly | null): boolean {
  if (!marine) return false;
  return marine.current_speed_kn.some(
    (v): v is number => v != null && v >= CURRENT_RELEVANCE_THRESHOLD_KN
  );
}

export function isTidesRelevant(marine: MarineHourly | null): boolean {
  if (!marine) return false;
  // Prefer ZH (chart-datum) heights when MARC covers — same range as MSL since
  // ZH is a linear shift by z0, so the threshold check is unchanged.
  const series = marine.tide_height_zh_m ?? marine.tide_height_m;
  const valid = series.filter((v): v is number => v != null);
  if (valid.length === 0) return false;
  return Math.max(...valid) - Math.min(...valid) >= TIDE_RANGE_RELEVANCE_THRESHOLD_M;
}

export function isWavesRelevant(marine: MarineHourly | null): boolean {
  // Waves are always relevant offshore; show the pill whenever any Hs is
  // present. Coastal-only spots without Marine coverage will see the pill
  // hidden.
  if (!marine) return false;
  return marine.wave_height_m.some((v) => v != null);
}
