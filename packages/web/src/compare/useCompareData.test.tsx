// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MarineHourly, ModelForecast, Spot } from "../types";
import { dismissOfflineNotice, offlineNoticeShown } from "../offline/offlineNotice";

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
const fetchWindCorridor = vi.fn((coords: unknown[]): Promise<ModelForecast[][]> =>
  Promise.resolve(coords.map(() => [])),
);
vi.mock("../api/openmeteo", () => ({
  fetchWindCorridor: (coords: unknown[]) => fetchWindCorridor(coords),
}));

const WIND: ModelForecast = {
  modelName: "AROME",
  hourly: {
    time: ["2026-11-24T12:00"],
    wind_speed_10m: [14],
    wind_gusts_10m: [19],
    wind_direction_10m: [300],
    weather_code: [3],
  } as ModelForecast["hourly"],
};

import { useCompareData } from "./useCompareData";

// The point of the forum report (#480), ten kilometres inside the Léon, and
// a harbour the mask leaves at sea.
const LEON: Spot = { name: "Léon", latitude: 48.565, longitude: -4.4 };
const CAMARET: Spot = { name: "Camaret", latitude: 48.28, longitude: -4.596 };

afterEach(() => {
  fetchIsLand.mockReset();
  fetchWindCorridor.mockClear();
  vi.restoreAllMocks();
  dismissOfflineNotice();
});

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

describe("useCompareData, without a network", () => {
  it("says so once when a spot could not be fetched, and fetches again when the network is back", async () => {
    fetchIsLand.mockResolvedValue(false);
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const spots = [CAMARET];
    const { result } = renderHook(() => useCompareData(spots));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].forecast).toBeNull();
    expect(offlineNoticeShown()).toBe(true);
    expect(fetchWindCorridor).toHaveBeenCalledTimes(1);

    fetchWindCorridor.mockImplementationOnce((coords) => Promise.resolve(coords.map(() => [WIND])));
    act(() => {
      onLine.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.rows[0].forecast).not.toBeNull());
    expect(fetchWindCorridor).toHaveBeenCalledTimes(2);
  });

  it("keeps the rows already on screen when a spot is added offline", async () => {
    fetchIsLand.mockResolvedValue(false);
    fetchWindCorridor.mockImplementationOnce((coords) => Promise.resolve(coords.map(() => [WIND])));
    const { result, rerender } = renderHook(({ spots }) => useCompareData(spots), {
      initialProps: { spots: [CAMARET] },
    });
    await waitFor(() => expect(result.current.rows[0]?.forecast).not.toBeNull());

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    rerender({ spots: [CAMARET, LEON] });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows[0].forecast).not.toBeNull();
    expect(result.current.rows[1].forecast).toBeNull();
    expect(offlineNoticeShown()).toBe(true);
  });
});
