// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  clearMarcCoverageCache,
  clearMarineCache,
  fetchMarineCorridor,
  isCurrentsRelevant,
  isTidesRelevant,
  isWavesRelevant,
  marcMayCover,
  mergeMarcOverlay,
  parseMarcCoverage,
  resetMarcBatchSupport,
  type MarcAtlasBox,
  type MarcOverlay,
} from "./marine";
import type { MarineHourly } from "../types";

function emptyMarine(): MarineHourly {
  return {
    time: ["2026-05-08T00:00", "2026-05-08T01:00", "2026-05-08T02:00"],
    wave_height_m: [null, null, null],
    wave_period_s: [null, null, null],
    wave_direction_deg: [null, null, null],
    current_speed_kn: [null, null, null],
    current_direction_to_deg: [null, null, null],
    tide_height_m: [null, null, null],
  };
}

describe("isCurrentsRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isCurrentsRelevant(null)).toBe(false);
  });

  it("returns false when all currents below 0.3 kt threshold (Mediterranean case)", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.05, 0.1, 0.2];
    expect(isCurrentsRelevant(m)).toBe(false);
  });

  it("returns true when at least one current reaches 0.3 kt threshold", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.05, 0.3, 0.2];
    expect(isCurrentsRelevant(m)).toBe(true);
  });

  it("returns true when current is well above threshold (Atlantic tidal pass)", () => {
    const m = emptyMarine();
    m.current_speed_kn = [0.1, 4.5, 3.2];
    expect(isCurrentsRelevant(m)).toBe(true);
  });
});

describe("isTidesRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isTidesRelevant(null)).toBe(false);
  });

  it("returns false when range stays below 0.5 m (Mediterranean case)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-0.15, 0.0, 0.15]; // range = 0.30
    expect(isTidesRelevant(m)).toBe(false);
  });

  it("returns true when range reaches 0.5 m threshold", () => {
    const m = emptyMarine();
    m.tide_height_m = [-0.25, 0.0, 0.25]; // range = 0.50
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns true for Atlantic tidal range (several meters)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-3.5, 0.0, 4.0]; // range = 7.5
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns false when all tide values are null (no SMOC coverage)", () => {
    expect(isTidesRelevant(emptyMarine())).toBe(false);
  });
});

describe("isWavesRelevant", () => {
  it("returns false when null marine data", () => {
    expect(isWavesRelevant(null)).toBe(false);
  });

  it("returns true as long as any Hs is present", () => {
    const m = emptyMarine();
    m.wave_height_m = [null, 0.3, null];
    expect(isWavesRelevant(m)).toBe(true);
  });

  it("returns false when no Hs anywhere (no Marine coverage)", () => {
    expect(isWavesRelevant(emptyMarine())).toBe(false);
  });
});

function brestMarine(): MarineHourly {
  // Brest, mid-July CEST (+02:00). Three Open-Meteo hours starting at 00:00
  // local. The corresponding UTC instants are 2026-06-30T22:00Z, 23:00Z,
  // 2026-07-01T00:00Z — that's what MARC would return.
  return {
    time: [
      "2026-07-01T00:00",
      "2026-07-01T01:00",
      "2026-07-01T02:00",
    ],
    wave_height_m: [0.5, 0.6, 0.7],
    wave_period_s: [6, 6, 7],
    wave_direction_deg: [270, 270, 280],
    current_speed_kn: [0.05, 0.04, 0.06], // SMOC at Brest port: near-zero
    current_direction_to_deg: [180, 180, 180],
    tide_height_m: [-1.5, 0.0, 1.5], // SMOC MSL reference
  };
}

function brestMarcOverlay(): MarcOverlay {
  // What the MARC endpoint would return for the brestMarine() window. Tide
  // is in MSL (MARC's native output) — the merge step subtracts z0 to derive
  // ZH. Currents are in kn (already converted server-side).
  return {
    covered: true,
    current_source: "marc_finis_250m",
    atlas_resolution_m: 250,
    z0_hydro_m: -3.74,
    times: [
      "2026-06-30T22:00:00+00:00",
      "2026-06-30T23:00:00+00:00",
      "2026-07-01T00:00:00+00:00",
    ],
    tide_height_m: [2.1, 3.5, 5.2],
    current_speed_kn: [0.4, 0.8, 1.2],
    current_direction_to_deg: [90, 95, 100],
  };
}

describe("mergeMarcOverlay", () => {
  it("returns base data unchanged when overlay is null", () => {
    const m = brestMarine();
    const merged = mergeMarcOverlay(m, null);
    expect(merged).toEqual(m);
    expect(merged.tide_height_zh_m).toBeUndefined();
    expect(merged.current_source).toBeUndefined();
  });

  it("returns base data unchanged when covered=false", () => {
    const m = brestMarine();
    const merged = mergeMarcOverlay(m, { covered: false });
    expect(merged).toEqual(m);
    expect(merged.tide_height_zh_m).toBeUndefined();
  });

  it("overrides tide and current at matching hours", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    expect(merged.tide_height_m).toEqual([2.1, 3.5, 5.2]);
    expect(merged.current_speed_kn).toEqual([0.4, 0.8, 1.2]);
    expect(merged.current_direction_to_deg).toEqual([90, 95, 100]);
  });

  it("populates tide_height_zh_m as MSL minus z0_hydro_m (always ≥ 0 here)", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    // z0 = -3.74 → ZH = MSL - (-3.74) = MSL + 3.74
    expect(merged.tide_height_zh_m).not.toBeNull();
    const zh = merged.tide_height_zh_m as (number | null)[];
    expect(zh[0]).toBeCloseTo(2.1 + 3.74, 6);
    expect(zh[1]).toBeCloseTo(3.5 + 3.74, 6);
    expect(zh[2]).toBeCloseTo(5.2 + 3.74, 6);
    // ZH heights at Brest are between ~2 m and ~9 m — what charts display.
    for (const v of zh) expect(v).not.toBeNull();
    expect(Math.min(...(zh as number[]))).toBeGreaterThan(0);
  });

  it("propagates current_source, marc_resolution_m, z0_hydro_m on the result", () => {
    const merged = mergeMarcOverlay(brestMarine(), brestMarcOverlay());
    expect(merged.current_source).toBe("marc_finis_250m");
    expect(merged.marc_resolution_m).toBe(250);
    expect(merged.z0_hydro_m).toBeCloseTo(-3.74, 6);
  });

  it("leaves SMOC values intact at unmatched hours (overlay shorter than OM)", () => {
    const m = brestMarine();
    const partial: MarcOverlay = {
      covered: true,
      current_source: "marc_finis_250m",
      atlas_resolution_m: 250,
      z0_hydro_m: -3.74,
      // Only the first OM hour matches a MARC sample.
      times: ["2026-06-30T22:00:00+00:00"],
      tide_height_m: [2.1],
      current_speed_kn: [0.4],
      current_direction_to_deg: [90],
    };
    const merged = mergeMarcOverlay(m, partial);
    expect(merged.tide_height_m[0]).toBe(2.1);
    // Index 1 and 2 keep SMOC values.
    expect(merged.tide_height_m[1]).toBe(0.0);
    expect(merged.tide_height_m[2]).toBe(1.5);
    // ZH array sized like OM, with nulls at unmatched hours.
    const zh = merged.tide_height_zh_m as (number | null)[];
    expect(zh[0]).toBeCloseTo(2.1 + 3.74, 6);
    expect(zh[1]).toBeNull();
    expect(zh[2]).toBeNull();
  });
});

describe("isTidesRelevant with MARC ZH", () => {
  it("uses ZH series when present (linear shift, same range)", () => {
    const m = emptyMarine();
    m.tide_height_m = [-1, 0, 1];
    m.tide_height_zh_m = [2.0, 3.0, 4.0]; // same range = 2.0
    expect(isTidesRelevant(m)).toBe(true);
  });

  it("returns false when ZH range below threshold (Mediterranean MARC zone hypothetical)", () => {
    const m = emptyMarine();
    m.tide_height_zh_m = [1.0, 1.1, 1.2]; // range = 0.20, below 0.5 m
    expect(isTidesRelevant(m)).toBe(false);
  });
});

// ── MARC coverage and the corridor batch ─────────────────────────────────────

const MED_BOX: MarcAtlasBox = {
  // Deliberately nowhere near the Mediterranean: the audit measured 14 MARC
  // answers out of 14 saying `covered: false` on a Corsican leg.
  name: "FINIS",
  source: "marc",
  bbox: [47.5, -6.0, 49.0, -3.5],
};

describe("parseMarcCoverage", () => {
  it("reads the documented body", () => {
    expect(parseMarcCoverage({ atlases: [MED_BOX] })).toEqual([MED_BOX]);
  });

  it("accepts an empty list, which is a real answer", () => {
    // A Space that booted without the atlas dataset. Nothing to ask.
    expect(parseMarcCoverage({ atlases: [] })).toEqual([]);
  });

  it("rejects a body that is not the documented shape", () => {
    // The caller then falls back to asking MARC, point by point, as before.
    expect(parseMarcCoverage(null)).toBeNull();
    expect(parseMarcCoverage("Not Found")).toBeNull();
    expect(parseMarcCoverage({})).toBeNull();
    expect(parseMarcCoverage({ atlases: {} })).toBeNull();
  });

  it("drops an unreadable entry instead of the whole answer", () => {
    // One atlas we cannot read is no reason to spend a request on every point
    // of every other one. Dropping it can only make the client ask more.
    const body = {
      atlases: [
        { name: "X", source: "marc" },
        { name: "Y", source: "marc", bbox: [1, 2, 3] },
        { name: "Z", source: "marc", bbox: [1, 2, 3, "4"] },
        { name: "W", source: "marc", bbox: [9, 2, 1, 4] },
        MED_BOX,
      ],
    };
    expect(parseMarcCoverage(body)).toEqual([MED_BOX]);
  });

  it("reads the exact tiles when the entry carries them", () => {
    const withCells = {
      ...MED_BOX,
      cells: [
        [47.5, -6.0, 48.0, -5.0],
        [48.0, -5.0, 49.0, -3.5],
      ],
    };
    expect(parseMarcCoverage({ atlases: [withCells] })).toEqual([withCells]);
  });

  it("keeps the bbox in charge when the tiles are unreadable", () => {
    const parsed = parseMarcCoverage({
      atlases: [{ ...MED_BOX, cells: [[1, 2, 3], "nope"] }],
    });
    expect(parsed).toEqual([MED_BOX]);
    expect(parsed![0].cells).toBeUndefined();
  });

  it("keeps only the readable tiles of a partly broken list", () => {
    const parsed = parseMarcCoverage({
      atlases: [{ ...MED_BOX, cells: [[47.5, -6.0, 48.0, -5.0], [1, 2, 3]] }],
    });
    expect(parsed![0].cells).toEqual([[47.5, -6.0, 48.0, -5.0]]);
  });
});

describe("marcMayCover", () => {
  it("says yes inside a box", () => {
    expect(marcMayCover(48.3, -4.5, [MED_BOX])).toBe(true);
  });

  it("says no outside every box", () => {
    expect(marcMayCover(42.1, 6.9, [MED_BOX])).toBe(false);
  });

  it("includes the edges, the boxes being widened server-side already", () => {
    expect(marcMayCover(47.5, -6.0, [MED_BOX])).toBe(true);
    expect(marcMayCover(49.0, -3.5, [MED_BOX])).toBe(true);
  });

  it("asks when coverage is unknown, which is the old behaviour", () => {
    expect(marcMayCover(42.1, 6.9, null)).toBe(true);
  });

  it("asks nothing when the server publishes no atlas at all", () => {
    expect(marcMayCover(48.3, -4.5, [])).toBe(false);
  });

  // MARC's ATLNE bbox spans [39.98, -20.03] to [64.99, 15.00]: it swallows the
  // whole western Mediterranean while holding no tile there. The bbox alone
  // would send every Corsican corridor point back to MARC for nothing.
  const ATLNE: MarcAtlasBox = {
    name: "ATLNE",
    source: "marc",
    bbox: [39.98, -20.03, 64.99, 15.0],
    cells: [
      [47.0, -6.0, 51.0, 0.0],
      [43.0, -3.0, 47.0, 0.0],
    ],
  };

  it("tests the tiles, not the bbox, when the entry carries them", () => {
    // Corsica: inside the bbox, outside every tile.
    expect(marcMayCover(42.1, 6.9, [ATLNE])).toBe(false);
    // Iroise: inside a tile.
    expect(marcMayCover(48.3, -4.5, [ATLNE])).toBe(true);
  });

  it("falls back to the bbox for an entry without tiles", () => {
    const noCells: MarcAtlasBox = { name: ATLNE.name, source: ATLNE.source, bbox: ATLNE.bbox };
    expect(marcMayCover(42.1, 6.9, [noCells])).toBe(true);
  });

  it("still covers a point any single atlas covers", () => {
    expect(marcMayCover(48.3, -4.5, [MED_BOX, ATLNE])).toBe(true);
  });
});

describe("fetchMarineCorridor", () => {
  /** One Open-Meteo Marine element: three hours, one usable wave height. */
  function omPoint(waveHeight: number) {
    return {
      hourly: {
        time: ["2026-05-08T00:00", "2026-05-08T01:00", "2026-05-08T02:00"],
        wave_height: [waveHeight, waveHeight, waveHeight],
        ocean_current_velocity: [1.852, 1.852, 1.852],
      },
    };
  }

  interface Calls {
    marine: string[];
    /** Per-point GET /marine/marc, the path the batch route replaces. */
    marc: string[];
    /** One entry per POST /marine/marc/batch: the points it carried. */
    batch: [number, number][][];
    coverage: number;
  }

  interface StubOpts {
    /** Status of the batch route. 404 is a Space that predates it. */
    batchStatus?: number;
    /** Body of a 200 batch answer. Defaults to one uncovered overlay per point. */
    batchBody?: (points: [number, number][]) => unknown;
  }

  /** Stubs fetch and records what was asked of whom. */
  function stubFetch(
    coverage: { status: number; body?: unknown },
    points: number,
    opts: StubOpts = {},
  ): Calls {
    const calls: Calls = { marine: [], marc: [], batch: [], coverage: 0 };
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/marine/marc/coverage")) {
        calls.coverage += 1;
        return {
          ok: coverage.status === 200,
          status: coverage.status,
          json: async () => coverage.body,
        };
      }
      if (url.includes("/marine/marc/batch")) {
        const sent = JSON.parse(String(init?.body ?? "{}")) as {
          points: [number, number][];
        };
        calls.batch.push(sent.points);
        const status = opts.batchStatus ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () =>
            opts.batchBody
              ? opts.batchBody(sent.points)
              : { overlays: sent.points.map(() => ({ covered: false })) },
        };
      }
      if (url.includes("/marine/marc")) {
        calls.marc.push(url);
        return { ok: true, status: 200, json: async () => ({ covered: false }) };
      }
      calls.marine.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: points }, (_, i) => omPoint(0.5 + i / 10)),
      };
    });
    return calls;
  }

  const MED_CORRIDOR = [
    { lat: 41.903, lon: 6.284 },
    { lat: 42.006, lon: 6.609 },
    { lat: 42.109, lon: 6.934 },
    { lat: 42.212, lon: 7.257 },
  ];

  beforeEach(() => {
    clearMarineCache();
    clearMarcCoverageCache();
    resetMarcBatchSupport();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Open-Meteo once for the whole corridor", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 4);
    const out = await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marine).toHaveLength(1);
    // Coordinates travel comma-separated, in order, latitudes and longitudes
    // in parallel lists — the same shape the wind corridor uses.
    expect(calls.marine[0]).toContain("latitude=41.903,42.006,42.109,42.212");
    expect(calls.marine[0]).toContain("longitude=6.284,6.609,6.934,7.257");
    expect(out).toHaveLength(4);
    expect(out.every((m) => m !== null)).toBe(true);
    // Order preserved: element k of the answer belongs to coordinate k.
    expect(out[0]!.wave_height_m[0]).toBe(0.5);
    expect(out[3]!.wave_height_m[0]).toBeCloseTo(0.8);
  });

  it("converts currents from km/h to knots, like the single-point path", async () => {
    // 1.852 km/h is exactly one knot.
    stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 1);
    const out = await fetchMarineCorridor(MED_CORRIDOR.slice(0, 1));
    expect(out[0]!.current_speed_kn[0]).toBeCloseTo(1);
  });

  it("skips MARC entirely outside every atlas", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    // The measured case: 14 calls for 14 answers that could not carry data.
    expect(calls.marc).toEqual([]);
    expect(calls.coverage).toBe(1);
  });

  it("asks MARC once for the whole corridor inside an atlas", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 2);
    await fetchMarineCorridor([
      { lat: 48.3, lon: -4.5 },
      { lat: 48.4, lon: -4.6 },
    ]);
    expect(calls.batch).toEqual([
      [
        [48.3, -4.5],
        [48.4, -4.6],
      ],
    ]);
    expect(calls.marc).toEqual([]);
  });

  it("asks every point when the coverage endpoint is missing, but in one batch", async () => {
    // A Space deployed before the coverage route exists answers 404, so every
    // point is a candidate again. That is one batch, not one call per point.
    const calls = stubFetch({ status: 404 }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toHaveLength(1);
    expect(calls.batch[0]).toHaveLength(4);
    expect(calls.marc).toEqual([]);
  });

  it("does the same on a malformed coverage body", async () => {
    const calls = stubFetch({ status: 200, body: { oops: true } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toHaveLength(1);
    expect(calls.batch[0]).toHaveLength(4);
  });

  it("asks the coverage endpoint once per session, not once per point", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    clearMarineCache();
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.coverage).toBe(1);
    expect(calls.marine).toHaveLength(2);
  });

  it("serves a second plan over the same route from cache, no request at all", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    const again = await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marine).toHaveLength(1);
    expect(again.every((m) => m !== null)).toBe(true);
  });

  it("asks once for two corridor points in the same grid cell", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 1);
    const out = await fetchMarineCorridor([
      { lat: 42.10001, lon: 6.9 },
      { lat: 42.10002, lon: 6.9 },
    ]);
    expect(calls.marine[0]).toContain("latitude=42.10001&");
    expect(out[0]).toBe(out[1]);
  });

  it("returns nulls rather than throwing when Open-Meteo refuses", async () => {
    vi.stubGlobal("fetch", async (input: string) => {
      if (String(input).includes("coverage")) {
        return { ok: true, status: 200, json: async () => ({ atlases: [] }) };
      }
      return { ok: false, status: 429, json: async () => ({}) };
    });
    expect(await fetchMarineCorridor(MED_CORRIDOR)).toEqual([null, null, null, null]);
  });

  it("skips MARC on a bbox that swallows the route but holds no tile there", async () => {
    // ATLNE's bbox reaches the Balearics; its tiles stop at the Bay of Biscay.
    const atlne: MarcAtlasBox = {
      name: "ATLNE",
      source: "marc",
      bbox: [39.98, -20.03, 64.99, 15.0],
      cells: [[43.0, -6.0, 51.0, 0.0]],
    };
    const calls = stubFetch({ status: 200, body: { atlases: [atlne] } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marc).toEqual([]);
  });

  it("still asks on the same bbox when the entry carries no tile list", async () => {
    // The contract before `cells` existed: the bbox is all we have, so we ask.
    const calls = stubFetch(
      {
        status: 200,
        body: { atlases: [{ name: "ATLNE", source: "marc", bbox: [39.98, -20.03, 64.99, 15.0] }] },
      },
      4,
    );
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toHaveLength(1);
    expect(calls.batch[0]).toHaveLength(4);
  });

  it("porte la fenetre et le pas dans le corps du lot", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/coverage")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes("/marine/marc/batch")) {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            overlays: (body.points as unknown[]).map(() => ({ covered: false })),
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [omPoint(0.5)] };
    });
    await fetchMarineCorridor(MED_CORRIDOR.slice(0, 1));
    expect(body.step_minutes).toBe(60);
    expect(String(body.start)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(String(body.end)) - Date.parse(String(body.start))).toBe(
      7 * 24 * 3600 * 1000,
    );
  });

  it("fusionne chaque reponse du lot dans le point qui lui correspond", async () => {
    // Deux points couverts, un seul rendu couvert par le serveur : la maree
    // MARC doit atterrir sur le second et pas sur le premier.
    const calls = stubFetch({ status: 404 }, 2, {
      batchBody: (points) => ({
        overlays: points.map((_, k) =>
          k === 1
            ? {
                covered: true,
                z0_hydro_m: -3.74,
                // omPoint parle en heure de Paris : le 8 mai a 00:00 CEST,
                // c'est 22:00Z la veille.
                times: [
                  "2026-05-07T22:00:00+00:00",
                  "2026-05-07T23:00:00+00:00",
                  "2026-05-08T00:00:00+00:00",
                ],
                tide_height_m: [3.1, 3.2, 3.3],
                current_speed_kn: [0.4, 0.5, 0.6],
                current_direction_to_deg: [90, 90, 90],
              }
            : { covered: false },
        ),
      }),
    });
    const out = await fetchMarineCorridor([
      { lat: 48.3, lon: -4.5 },
      { lat: 48.4, lon: -4.6 },
    ]);
    expect(calls.batch).toHaveLength(1);
    expect(out[0]!.tide_height_zh_m).toBeUndefined();
    expect(out[0]!.current_speed_kn[0]).toBeCloseTo(1); // SMOC, intact
    expect(out[1]!.tide_height_zh_m![0]).toBeCloseTo(3.1 + 3.74);
    expect(out[1]!.current_speed_kn[0]).toBeCloseTo(0.4);
  });

  it("remplit le cache par point depuis la reponse du lot", async () => {
    const calls = stubFetch({ status: 404 }, 2);
    const route = [
      { lat: 48.3, lon: -4.5 },
      { lat: 48.4, lon: -4.6 },
    ];
    await fetchMarineCorridor(route);
    await fetchMarineCorridor(route);
    // Le second calcul ne redemande rien, ni la meteo marine ni MARC.
    expect(calls.marine).toHaveLength(1);
    expect(calls.batch).toHaveLength(1);
  });

  it("revient au point par point quand la route de lot n'existe pas, une seule fois", async () => {
    const calls = stubFetch({ status: 404 }, 4, { batchStatus: 404 });
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toHaveLength(1);
    expect(calls.marc).toHaveLength(4);

    // Le verdict est retenu : le corridor suivant part directement en GET.
    clearMarineCache();
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toHaveLength(1);
    expect(calls.marc).toHaveLength(8);
  });

  it("fait de meme sur un 405", async () => {
    const calls = stubFetch({ status: 404 }, 4, { batchStatus: 405 });
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marc).toHaveLength(4);
  });

  it("garde les donnees Open-Meteo quand le lot echoue autrement", async () => {
    // 500 n'est pas un verdict sur la route : pas de repli, pas de recouvrement
    // MARC, mais le corridor garde ses vagues et ses courants SMOC.
    const calls = stubFetch({ status: 404 }, 4, { batchStatus: 500 });
    const out = await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marc).toEqual([]);
    expect(out.every((m) => m !== null)).toBe(true);
    expect(out[0]!.wave_height_m[0]).toBe(0.5);
  });

  it("rejette un lot dont la longueur ne correspond pas aux points envoyes", async () => {
    // Un decalage collerait la maree d'un point sur la position d'un autre.
    const calls = stubFetch({ status: 404 }, 4, {
      batchBody: () => ({ overlays: [{ covered: true }] }),
    });
    const out = await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.marc).toEqual([]);
    expect(out.every((m) => m !== null)).toBe(true);
    expect(out[0]!.tide_height_zh_m).toBeUndefined();
  });

  it("ne demande rien du tout quand aucun point n'est couvert", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [MED_BOX] } }, 4);
    await fetchMarineCorridor(MED_CORRIDOR);
    expect(calls.batch).toEqual([]);
    expect(calls.marc).toEqual([]);
  });

  it("returns an empty result for an empty corridor without asking anything", async () => {
    const calls = stubFetch({ status: 200, body: { atlases: [] } }, 0);
    expect(await fetchMarineCorridor([])).toEqual([]);
    expect(calls.marine).toEqual([]);
    expect(calls.coverage).toBe(0);
  });
});
