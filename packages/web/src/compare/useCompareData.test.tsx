// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { MarineHourly, Spot } from "../types";

const fetchIsLand = vi.fn<(lat: number, lon: number) => Promise<boolean>>();
vi.mock("../api/land", () => ({ fetchIsLand: (lat: number, lon: number) => fetchIsLand(lat, lon) }));

const SEA: MarineHourly = {
  time: ["2026-11-24T12:00"],
  wave_height_m: [1.6],
  wave_period_s: [11],
  wave_direction_deg: [270],
  current_speed_kn: [1.9],
  current_direction_to_deg: [55],
  tide_height_m: [null],
};
vi.mock("../api/marine", () => ({
  fetchMarineCorridor: (coords: unknown[]) => Promise.resolve(coords.map(() => SEA)),
}));
vi.mock("../api/openmeteo", () => ({
  fetchWindCorridor: (coords: unknown[]) => Promise.resolve(coords.map(() => [])),
}));

import { useCompareData } from "./useCompareData";

// The point of the forum report (#480), ten kilometres inside the Léon, and
// a harbour the mask leaves at sea.
const LEON: Spot = { name: "Léon", latitude: 48.565, longitude: -4.4 };
const CAMARET: Spot = { name: "Camaret", latitude: 48.28, longitude: -4.596 };

afterEach(() => fetchIsLand.mockReset());

describe("useCompareData, a favourite on land", () => {
  it("drops the sea of the spot the server puts on land, and only that one", async () => {
    fetchIsLand.mockImplementation((lat) => Promise.resolve(lat === LEON.latitude));
    const spots = [LEON, CAMARET];
    const { result } = renderHook(() => useCompareData(spots));
    await waitFor(() => expect(result.current.rows[0]?.onLand).toBe(true));
    const [leon, camaret] = result.current.rows;
    expect(leon.marine).toBeNull();
    expect(camaret.onLand).toBeUndefined();
    expect(camaret.marine).toBe(SEA);
  });

  it("keeps the sea when the land answer fails or says sea", async () => {
    fetchIsLand.mockResolvedValue(false);
    const spots = [LEON];
    const { result } = renderHook(() => useCompareData(spots));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await waitFor(() => expect(fetchIsLand).toHaveBeenCalled());
    expect(result.current.rows[0].marine).toBe(SEA);
    expect(result.current.rows[0].onLand).toBeUndefined();
  });
});
