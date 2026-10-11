// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import type { MarineHourly } from "../types";
import { isCurrentsRelevant } from "../api/marine";
import { fromOverlay, unknownCurrentAt, unknownZoneAt, withhold } from "./unknownCurrent";

const SAINT_SULIAC = [48.567, -1.975] as const;
const DINARD_ROADS = [48.64, -2.06] as const;
const MESSINA = [38.2458, 15.6325] as const;

function series(): MarineHourly {
  return {
    time: ["2026-10-11T12:00", "2026-10-11T13:00"],
    wave_height_m: [0.4, 0.5],
    wave_period_s: [4, 4],
    wave_direction_deg: [300, 300],
    current_speed_kn: [1.2, 0.8],
    current_direction_to_deg: [180, 190],
    tide_height_m: [2.0, 1.5],
    tide_height_zh_m: [6.0, 5.5],
    current_source: "marc_manw_250m",
    marc_resolution_m: 250,
    tidal_gap: { zone: "x", kind: "pass", max_spring_kt: null },
  };
}

describe("unknown currents", () => {
  it("finds the Rance basin above the tidal power plant, and nothing at sea", () => {
    const zone = unknownZoneAt(...SAINT_SULIAC);
    expect(zone?.zone).toMatch(/Rance/);
    expect(zone?.reason).toBe("managed");
    expect(zone?.fields).toEqual(["current", "tide"]);
    expect(unknownZoneAt(...DINARD_ROADS)).toBeNull();
    expect(unknownZoneAt(43.29, 5.37)).toBeNull();
  });

  it("blanks what the zone lists and marks the series, rather than falling back", () => {
    const out = withhold(series(), { zone: "Rance", reason: "managed", fields: ["current", "tide"] });
    expect(out.current_speed_kn).toEqual([null, null]);
    expect(out.current_direction_to_deg).toEqual([null, null]);
    expect(out.tide_height_m).toEqual([null, null]);
    expect(out.tide_height_zh_m).toEqual([null, null]);
    expect(out.wave_height_m).toEqual([0.4, 0.5]);
    expect(out.current_source).toBe("unknown");
    expect(out.tidal_gap).toBeUndefined();
    expect(out.current_unknown?.zone).toBe("Rance");
    // The currents tab stays, since it is where the spot says why.
    expect(isCurrentsRelevant(out)).toBe(true);
  });

  it("keeps the tide when only the current is withheld", () => {
    const out = withhold(series(), { zone: "Pass", reason: "unresolved", fields: ["current"] });
    expect(out.current_speed_kn).toEqual([null, null]);
    expect(out.tide_height_m).toEqual([2.0, 1.5]);
  });

  it("withholds a coarse source beside a listed pass, not a fine one that sees it", async () => {
    const coarse = await unknownCurrentAt(...MESSINA, { current_source: "cmems_med_4200m", marc_resolution_m: 4200 });
    expect(coarse?.reason).toBe("unresolved");
    expect(coarse?.zone).toMatch(/Messina/);
    expect(coarse?.fields).toEqual(["current"]);
    // The global model, no label at all: same answer.
    expect((await unknownCurrentAt(...MESSINA, { current_source: undefined, marc_resolution_m: undefined }))?.zone).toMatch(/Messina/);
    // A 250 m grid is not listed as blind there.
    expect(await unknownCurrentAt(...MESSINA, { current_source: "test_messina_250m", marc_resolution_m: 250 })).toBeNull();
    // Beyond 3 km the value stays (the 15 km warning is the gap's business).
    expect(await unknownCurrentAt(38.2458, 15.72, { current_source: "cmems_med_4200m", marc_resolution_m: 4200 })).toBeNull();
  });

  it("withholds a fine atlas the builder measured blind at the pass", async () => {
    const hit = await unknownCurrentAt(67.2281, 14.6164, { current_source: "norkyst_lofoten_800m", marc_resolution_m: 800 });
    expect(hit?.zone).toBe("Saltstraumen");
  });
});

describe("the server's own unknown", () => {
  it("reads dead water of a coastal atlas as unknown with no zone", () => {
    const u = fromOverlay({ zone: null, reason: "model_edge", fields: ["current", "tide"] });
    expect(u).toEqual({ zone: "", reason: "model_edge", fields: ["current", "tide"] });
    const out = withhold(series(), u);
    expect(out.current_speed_kn).toEqual([null, null]);
    expect(out.tide_height_m).toEqual([null, null]);
    expect(out.current_unknown?.reason).toBe("model_edge");
    // A reason this build does not know stays an unknown, not a value.
    expect(fromOverlay({ reason: "later" }).reason).toBe("model_edge");
  });
});
