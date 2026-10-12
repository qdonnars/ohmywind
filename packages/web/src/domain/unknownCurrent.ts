// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Where we know that we do not know the current, and what to blank there.
 *
 * Two cases, the server's own (``currents/unknown_zones.py`` and the engine's
 * ``_unknown_current_zone``). A documented zone of ``unknownZones.json``, a
 * byte-identical copy of the server's ``unknown_zones.geojson`` (a server test
 * keeps the two equal): the Rance above its tidal power plant, whose level and
 * streams follow EDF's operating orders. And a known pass within 3 km that the
 * source of the spot's currents cannot see. In both, the Open-Meteo baseline
 * is no better than the atlas, so the values are withheld, not fallen back to.
 */
import type { FeatureCollection, Geometry } from "geojson";

import type { MarineHourly } from "../types";
import { blindPassAt, inGeometry } from "./tidalGaps";
import zonesJson from "./unknownZones.json";

type UnknownReason = "managed" | "unresolved" | "non_tidal" | "model_edge";
type WithheldField = "current" | "tide";

export interface UnknownCurrent {
  zone: string;
  reason: UnknownReason;
  fields: WithheldField[];
}

interface ZoneProps {
  id: string;
  name: string;
  reason: UnknownReason;
  fields: WithheldField[];
  source: string;
}

const ZONES = zonesJson as unknown as FeatureCollection<Geometry, ZoneProps>;

/** The documented zone a point falls in. Synchronous: the file is a few polygons. */
export function unknownZoneAt(lat: number, lon: number): UnknownCurrent | null {
  for (const f of ZONES.features) {
    if (inGeometry(lon, lat, f.geometry)) {
      return { zone: f.properties.name, reason: f.properties.reason, fields: f.properties.fields };
    }
  }
  return null;
}

/** The zone, or else the blind pass, that makes the currents of a spot unknown. */
export async function unknownCurrentAt(
  lat: number,
  lon: number,
  data: Pick<MarineHourly, "current_source" | "marc_resolution_m">,
): Promise<UnknownCurrent | null> {
  const zone = unknownZoneAt(lat, lon);
  if (zone) return zone;
  const blind = await blindPassAt(lat, lon, data.current_source, data.marc_resolution_m);
  return blind ? { zone: blind.zone, reason: "unresolved", fields: ["current"] } : null;
}

/** The server's own "unknown" (overlay ``unknown``), in the shape the screens read:
    a documented zone, or dead water of a coastal atlas (``model_edge``, no zone). */
export function fromOverlay(u: { zone?: string | null; reason?: string; fields?: string[] }): UnknownCurrent {
  const reasons: UnknownReason[] = ["managed", "unresolved", "non_tidal", "model_edge"];
  const reason = reasons.includes(u.reason as UnknownReason) ? (u.reason as UnknownReason) : "model_edge";
  const fields = (u.fields ?? ["current"]).filter((f): f is WithheldField => f === "current" || f === "tide");
  return { zone: u.zone ?? "", reason, fields: fields.length ? fields : ["current"] };
}

/** The series with what `unknown` lists blanked, and the mark the screens read. */
export function withhold(data: MarineHourly, unknown: UnknownCurrent): MarineHourly {
  const blank = (arr: (number | null)[]) => arr.map(() => null);
  const noCurrent = unknown.fields.includes("current");
  const noTide = unknown.fields.includes("tide");
  return {
    ...data,
    current_speed_kn: noCurrent ? blank(data.current_speed_kn) : data.current_speed_kn,
    current_direction_to_deg: noCurrent ? blank(data.current_direction_to_deg) : data.current_direction_to_deg,
    tide_height_m: noTide ? blank(data.tide_height_m) : data.tide_height_m,
    tide_height_zh_m: noTide && data.tide_height_zh_m ? blank(data.tide_height_zh_m) : data.tide_height_zh_m,
    current_source: noCurrent ? "unknown" : data.current_source,
    tidal_gap: undefined,
    current_unknown: unknown,
  };
}
