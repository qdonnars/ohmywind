// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The goldens are real bodies, captured from `mcp-dev.ohmywind.fr` on
 * 2026-09-02 for a 12.7 NM leg out of Marseille. Copied rather than written by
 * hand: a fixture invented from the TypeScript types would only prove the
 * types agree with themselves.
 */
import { describe, it, expect } from "vitest";
import {
  ApiShapeError,
  parseArchetypes,
  parseMultiWindowResponse,
  parsePassageByEtaResponse,
  parsePassageResponse,
} from "./parse";
import single from "./__fixtures__/passage-single.json";
import sweep from "./__fixtures__/passage-sweep.json";

/** Deep clone, so a test can break one field without touching the others. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Replace a dotted path inside a clone of the golden. */
function withField(source: unknown, path: string, value: unknown): unknown {
  const copy = clone(source) as Record<string, unknown>;
  const parts = path.split(".");
  let node: Record<string, unknown> = copy;
  for (const part of parts.slice(0, -1)) {
    node = node[part] as Record<string, unknown>;
  }
  if (value === undefined) delete node[parts[parts.length - 1]];
  else node[parts[parts.length - 1]] = value;
  return copy;
}

describe("parsePassageResponse", () => {
  it("accepts the golden single-passage body", () => {
    const parsed = parsePassageResponse(clone(single));
    expect(parsed.passage.distance_nm).toBeCloseTo(12.73, 2);
    expect(parsed.passage.segments).toHaveLength(2);
    expect(parsed.complexity.label).toBe("facile");
    expect(parsed.forecast_updated_at).toMatch(/^2026-/);
  });

  it.each([
    ["passage", "passage", undefined],
    ["passage.duration_h", "passage.duration_h", "six heures"],
    ["passage.segments", "passage.segments", { "0": {} }],
    ["passage.warnings", "passage.warnings", [42]],
    ["complexity.level", "complexity.level", null],
    ["forecast_updated_at", "forecast_updated_at", undefined],
  ])("rejects a body whose %s is wrong", (_label, path, value) => {
    expect(() => parsePassageResponse(withField(single, path, value))).toThrow(ApiShapeError);
  });

  it("names the offending field, so a rollout mismatch is debuggable", () => {
    try {
      parsePassageResponse(withField(single, "passage.duration_h", "six heures"));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiShapeError);
      expect((error as ApiShapeError).path).toBe("passage.duration_h");
    }
  });

  it.each([
    ["not JSON at all", "nope"],
    ["an array", []],
    ["null", null],
    ["an HTML error page parsed as text", "<!doctype html>"],
  ])("rejects %s", (_label, body) => {
    expect(() => parsePassageResponse(body)).toThrow(ApiShapeError);
  });

  it("keeps a null wave height, which means no marine coverage", () => {
    expect(() =>
      parsePassageResponse(withField(single, "passage", {
        ...clone(single).passage,
        segments: clone(single).passage.segments.map((s) => ({ ...s, hs_m: null })),
      })),
    ).not.toThrow();
  });

  it("keeps a complexity with no warnings array, which is the calm case", () => {
    expect(() =>
      parsePassageResponse(withField(single, "complexity.warnings", undefined)),
    ).not.toThrow();
  });
});

describe("parseMultiWindowResponse", () => {
  it("accepts the golden sweep body", () => {
    const parsed = parseMultiWindowResponse(clone(sweep));
    expect(parsed.sweep.window_count).toBe(2);
    expect(parsed.windows).toHaveLength(2);
    expect(parsed.windows[0].passage).toBeDefined();
    expect(parsed.meta_warnings).toEqual([]);
  });

  it("rejects a single-passage body handed to the sweep parser", () => {
    expect(() => parseMultiWindowResponse(clone(single))).toThrow(ApiShapeError);
  });

  it.each([
    ["sweep", "sweep", undefined],
    ["sweep.interval_hours", "sweep.interval_hours", "6h"],
    ["windows", "windows", {}],
    ["meta_warnings", "meta_warnings", "aucun"],
  ])("rejects a body whose %s is wrong", (_label, path, value) => {
    expect(() => parseMultiWindowResponse(withField(sweep, path, value))).toThrow(ApiShapeError);
  });

  it("accepts windows without the per-window detail, as older deployments send", () => {
    const body = clone(sweep);
    for (const w of body.windows) {
      delete (w as Record<string, unknown>).passage;
      delete (w as Record<string, unknown>).complexity_full;
    }
    const parsed = parseMultiWindowResponse(body);
    expect(parsed.windows[0].passage).toBeUndefined();
  });

  it("rejects a window whose per-window passage is itself malformed", () => {
    const body = clone(sweep);
    (body.windows[0].passage as Record<string, unknown>).segments = "beaucoup";
    expect(() => parseMultiWindowResponse(body)).toThrow(/windows\[0\]\.passage\.segments/);
  });
});

describe("parsePassageByEtaResponse", () => {
  it("requires the eta block on top of the passage", () => {
    expect(() => parsePassageByEtaResponse(clone(single))).toThrow(ApiShapeError);
    const withEta = { ...clone(single), eta: { target_arrival: "2026-09-04T14:00:00+02:00" } };
    expect(parsePassageByEtaResponse(withEta).eta.target_arrival).toBe(
      "2026-09-04T14:00:00+02:00",
    );
  });
});

describe("parseArchetypes", () => {
  it("accepts a catalogue and keeps the extra fields", () => {
    const list = parseArchetypes([
      { slug: "cruiser_30ft", name: "Croiseur 30 pieds", length_ft: 30, futur_champ: 1 },
    ]);
    expect(list[0].slug).toBe("cruiser_30ft");
  });

  it.each([
    ["an object instead of a list", {}],
    ["an entry without a slug", [{ name: "Croiseur" }]],
    ["an entry without a name", [{ slug: "cruiser_30ft" }]],
  ])("rejects %s", (_label, body) => {
    expect(() => parseArchetypes(body)).toThrow(ApiShapeError);
  });
});
