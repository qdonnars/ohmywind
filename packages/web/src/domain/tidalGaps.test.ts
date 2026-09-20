// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { findTidalGap, tidalGapAt, tidalGapForSource } from "./tidalGaps";
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
});
