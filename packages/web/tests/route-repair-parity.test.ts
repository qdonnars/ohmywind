// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The route repair of the app against the server's, route by route.
 *
 * The repair exists twice: in Python for the MCP server and the REST API
 * (`openwind_data.routing.auto_route`), in TypeScript for the app
 * (`src/plan/repair`), which retraces a route in the browser. Nothing but
 * this keeps the two in step, and a drift would show one route in the app
 * and plan another through the connector.
 *
 * `fixtures/route-repair/parity.json` holds what the Python repair answers
 * for each drawn route of `routes.json`, on the land tiles shipped in the
 * Python package. `scripts/build_route_parity_corpus.py` writes it, and a
 * Python test checks it is still what Python answers. The TypeScript repair
 * must give the same outcome and the same points.
 *
 * If it fails after a change of the Python engine or of the tiles, run the
 * script again, then bring `src/plan/repair` in line until this passes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { repairRoute, type RepairOutcome } from "../src/plan/repair/repair";
import { LandStore } from "../src/plan/repair/tiles";
import { BUNDLED_ARCHIVE, archiveSource } from "./landArchive";

interface Expected {
  kind: string;
  points?: number[][];
  added?: number[];
  notices?: { code: string; params: Record<string, string | number> }[];
}

const parity = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/route-repair/parity.json", import.meta.url)),
    "utf8",
  ),
) as { archive: string; cases: Record<string, { drawn: number[][]; outcome: Expected }> };

/** A hundredth of a millimetre: the two engines differ by rounding alone. */
const TOLERANCE_DEG = 1e-10;

function noticeParams(outcome: Extract<RepairOutcome, { kind: "repaired" }>) {
  return outcome.notices.map((n) =>
    n.code === "route.leg_retraced"
      ? {
          code: n.code,
          params: { leg: n.leg, retraced_nm: n.retracedNm, straight_nm: n.straightNm },
        }
      : { code: n.code, params: { distance_m: n.distanceM } },
  );
}

describe("route repair, TypeScript against Python", async () => {
  const source = archiveSource(BUNDLED_ARCHIVE);
  const store = await LandStore.open(source);

  it("reads the archive the corpus was computed on", () => {
    expect(store.id).toBe(parity.archive);
  });

  it.each(Object.entries(parity.cases))("%s", async (_name, { drawn, outcome: expected }) => {
    const got = await repairRoute(
      store,
      drawn.map(([lat, lon]) => ({ lat, lon })),
    );
    expect(got.kind).toBe(expected.kind);
    if (got.kind !== "repaired") return;
    const points = expected.points ?? [];
    expect(got.points).toHaveLength(points.length);
    got.points.forEach((p, i) => {
      expect(Math.abs(p.lat - points[i][0])).toBeLessThan(TOLERANCE_DEG);
      expect(Math.abs(p.lon - points[i][1])).toBeLessThan(TOLERANCE_DEG);
    });
    expect(got.added).toEqual(expected.added);
    expect(noticeParams(got)).toEqual(expected.notices);
  });

  it("keeps the tiles of a route: asked twice, fetched once", async () => {
    const fresh = archiveSource(BUNDLED_ARCHIVE);
    const own = await LandStore.open(fresh);
    const route = parity.cases.brest_ouessant.drawn.map(([lat, lon]) => ({ lat, lon }));
    await repairRoute(own, route);
    const first = fresh.fetched;
    await repairRoute(own, route);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(10);
    expect(fresh.fetched).toBe(first);
  });
});
