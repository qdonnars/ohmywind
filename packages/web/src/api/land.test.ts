// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchIsLand, withoutSea, __resetLandCache } from "./land";
import { isCurrentsRelevant, isTidesRelevant, isWavesRelevant } from "./marine";
import type { MarineHourly } from "../types";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetLandCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(land: boolean) {
  return { ok: true, json: async () => ({ land }) };
}

describe("fetchIsLand", () => {
  it("says land when the server does", async () => {
    // The Léon, ten kilometres inland (#480).
    fetchMock.mockResolvedValue(answer(true));
    await expect(fetchIsLand(48.565, -4.4)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/marine/land?lat=48.565&lon=-4.4");
  });

  it("asks once per point, land does not move", async () => {
    fetchMock.mockResolvedValue(answer(false));
    await fetchIsLand(47.3, -2.3);
    await fetchIsLand(47.3001, -2.3001);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to sea on any failure, and asks again next time", async () => {
    // A Space that predates the route answers 404; the card stays as it was.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(fetchIsLand(48.565, -4.4)).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchIsLand(48.565, -4.4)).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce(answer(true));
    await expect(fetchIsLand(48.565, -4.4)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("withoutSea", () => {
  it("leaves no sea tab to show", () => {
    const marine: MarineHourly = {
      time: ["2026-10-12T17:00", "2026-10-12T18:00"],
      wave_height_m: [1.5, 1.5],
      wave_period_s: [10, 10],
      wave_direction_deg: [271, 271],
      current_speed_kn: [1.9, 1.8],
      current_direction_to_deg: [55, 55],
      tide_height_m: [2.1, -1.4],
      current_source: "marc_finis_250m",
      tide_coefficient: 90,
    };
    const dry = withoutSea(marine);
    expect(dry.time).toEqual(marine.time);
    expect(isWavesRelevant(dry)).toBe(false);
    expect(isCurrentsRelevant(dry)).toBe(false);
    expect(isTidesRelevant(dry)).toBe(false);
    expect(dry.current_source).toBeUndefined();
  });
});
