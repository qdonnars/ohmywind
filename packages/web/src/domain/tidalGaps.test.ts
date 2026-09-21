// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { findTidalGap, findUnresolvedPass, tidalGapAt, tidalGapForSource } from "./tidalGaps";
import gaps from "./tidalGaps.json";

describe("tidal gaps", () => {
  it("names the Elbe entry at Cuxhaven and stays quiet in the Bay of Biscay", async () => {
    const hit = await tidalGapAt(53.87, 8.7);
    expect(hit?.kind).toBe("pass");
    expect(hit?.zone).toMatch(/Elbe|Cuxhaven/);
    expect(await tidalGapAt(46.0, -5.0)).toBeNull();
    expect(await tidalGapAt(42.5, 5.5)).toBeNull();
  });

  it("only warns when the currents come from the global model or a coarse atlas", async () => {
    expect(await tidalGapForSource(53.87, 8.7, "shom_c2d_558_morbihan", null)).toBeNull();
    expect(await tidalGapForSource(53.87, 8.7, "marc_manga_700m", 700)).toBeNull();
    expect((await tidalGapForSource(53.87, 8.7, "marc_atlne_2000m", 2000))?.kind).toBe("pass");
    expect((await tidalGapForSource(53.87, 8.7, undefined, null))?.kind).toBe("pass");
    expect((await tidalGapForSource(53.87, 8.7, "openmeteo_smoc", null))?.kind).toBe("pass");
  });

  it("falls back to the computed mask when no pass is near", () => {
    const collection = gaps as unknown as Parameters<typeof findTidalGap>[2];
    const mask = collection.features.find((f) => f.properties.kind === "mask");
    expect(mask).toBeDefined();
    // Any vertex of the mask, nudged inwards, is inside it; with the pass
    // radius at zero the mask is the only possible answer.
    const geometry = mask!.geometry as { type: string; coordinates: number[][][] | number[][][][] };
    const ring = (geometry.type === "Polygon" ? (geometry.coordinates as number[][][])[0] : (geometry.coordinates as number[][][][])[0][0]) as number[][];
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const inside = ring.find(([x, y]) => findTidalGap(y + (cy - y) * 0.01, x + (cx - x) * 0.01, collection, 0) !== null);
    expect(inside).toBeDefined();
  });

  it("keeps the warning on a fine atlas beside a pass it is blind to", async () => {
    // Saltstraumen: the snapshot lists NorKyst 800 m as blind (no cell in
    // the 150 m channel); a 160 m nest at the same spot is not listed.
    const hit = await tidalGapForSource(67.2303, 14.6164, "norkyst_lofoten_800m", 800);
    expect(hit?.kind).toBe("pass");
    expect(hit?.zone).toBe("Saltstraumen");
    expect(await tidalGapForSource(67.2303, 14.6164, "norkyst_lofoten_160m", 160)).toBeNull();
    // Out in the Vestfjorden the same atlas is fine.
    expect(await tidalGapForSource(67.5, 13.0, "norkyst_lofoten_800m", 800)).toBeNull();
  });

  it("walks past a nearer pass the source does resolve", () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { kind: "pass", name: "Near, resolved", max_spring_kt: 3 }, geometry: { type: "Point", coordinates: [0, 50] } },
        { type: "Feature", properties: { kind: "pass", name: "Far, blind", max_spring_kt: 6, unresolved_by: ["bsh_x_926m"] }, geometry: { type: "Point", coordinates: [0, 50.02] } },
      ],
    } as unknown as Parameters<typeof findUnresolvedPass>[3];
    expect(findUnresolvedPass(50.001, 0, "bsh_x_926m", collection)?.zone).toBe("Far, blind");
    expect(findUnresolvedPass(50.001, 0, "bsh_y_90m", collection)).toBeNull();
    expect(findUnresolvedPass(50.06, 0, "bsh_x_926m", collection)).toBeNull();
  });
});
