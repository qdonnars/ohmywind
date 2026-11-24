// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const searchPlaces = vi.fn();
vi.mock("../api/geocoding", () => ({
  searchPlaces: (...args: unknown[]) => searchPlaces(...args),
}));

import { SpotSearch } from "./SpotSearch";

beforeEach(() => {
  vi.useFakeTimers();
  searchPlaces.mockReset();
  searchPlaces.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Past the debounce, with the pending promise settled. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe("SpotSearch", () => {
  it("does not search again when only the map moves under a text left in the field (#579)", async () => {
    const onSelect = vi.fn();
    // A query no other test of this file types: the results are cached by
    // the module across renders.
    const { rerender } = render(<SpotSearch onSelect={onSelect} nearLat={47.64} nearLon={-3.45} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Port-Tudy" } });
    await settle();
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(searchPlaces.mock.calls[0][1].near).toEqual({ lat: 47.64, lon: -3.45 });

    // The page hands the centre of the map: three pans, three new points.
    for (const [lat, lon] of [[47.7, -3.3], [48.1, -4.2], [43.2, 5.3]]) {
      rerender(<SpotSearch onSelect={onSelect} nearLat={lat} nearLon={lon} />);
      await settle();
    }
    expect(searchPlaces).toHaveBeenCalledTimes(1);

    // A change of the text searches again, from where the map now is.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Port-Tudy G" } });
    await settle();
    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(searchPlaces.mock.calls[1][1].near).toEqual({ lat: 43.2, lon: 5.3 });
  });
});
