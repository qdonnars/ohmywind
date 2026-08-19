// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchDepthM, depthGridKey, __resetDepthCache } from "./bathymetry";

/** One EMODnet GetFeatureInfo body, with the Depth it reports. */
function depthResponse(depth: number) {
  return {
    ok: true,
    json: async () => ({ features: [{ properties: { Depth: depth } }] }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetDepthCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDepthM", () => {
  it("turns the negative EMODnet value into metres of water", async () => {
    fetchMock.mockResolvedValue(depthResponse(-8.557143211364746));
    await expect(fetchDepthM(47.485, -3.075)).resolves.toBeCloseTo(8.5571, 4);
  });

  it("reports no sounding on land, where EMODnet answers with an elevation", async () => {
    // The DTM covers land too: the Quiberon peninsula comes back as +15 m,
    // Paris as +39 m. A positive number is never a depth.
    fetchMock.mockResolvedValue(depthResponse(14.98));
    await expect(fetchDepthM(47.483, -3.125)).resolves.toBeNull();
  });

  it("reads an exact zero as no data rather than as the waterline", async () => {
    // Outside the surveyed area EMODnet returns a flat 0 instead of null.
    // Printing "0 m" where we mean "unknown" is the dangerous way to be
    // wrong, and a waypoint on the 0.000 m contour to the millimetre is not
    // a case worth preserving.
    fetchMock.mockResolvedValue(depthResponse(0));
    await expect(fetchDepthM(40, -60)).resolves.toBeNull();
  });

  it("stays quiet when the service fails: a sounding is a bonus, never a reason to interrupt someone mid-route", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(fetchDepthM(47.485, -3.075)).resolves.toBeNull();

    fetchMock.mockRejectedValue(new Error("timeout"));
    await expect(fetchDepthM(48.0, -4.0)).resolves.toBeNull();
  });

  it("shrugs off a body without the field", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
    await expect(fetchDepthM(47.485, -3.075)).resolves.toBeNull();
  });

  it("serves a second lookup of the same grid cell from cache", async () => {
    fetchMock.mockResolvedValue(depthResponse(-12));
    await fetchDepthM(47.485, -3.075);
    await fetchDepthM(47.485, -3.075);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a null too, so a point on land is not re-asked on every render", async () => {
    fetchMock.mockResolvedValue(depthResponse(15));
    await fetchDepthM(47.483, -3.125);
    await fetchDepthM(47.483, -3.125);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a nudge inside one DTM cell as the same point", async () => {
    fetchMock.mockResolvedValue(depthResponse(-12));
    await fetchDepthM(47.4851, -3.0751);
    await fetchDepthM(47.48512, -3.07509);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent lookups of the same cell", async () => {
    fetchMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(depthResponse(-20)), 10)),
    );
    const [a, b] = await Promise.all([
      fetchDepthM(47.485, -3.075),
      fetchDepthM(47.485, -3.075),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(20);
    expect(b).toBe(20);
  });

  it("asks EMODnet for the lat,lon bbox order that WMS 1.3.0 wants", async () => {
    fetchMock.mockResolvedValue(depthResponse(-5));
    await fetchDepthM(47.485, -3.075);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const [minLat, minLon, maxLat, maxLon] = url.searchParams
      .get("bbox")!
      .split(",")
      .map(Number);
    // Latitudes bracket 47.485, longitudes bracket -3.075. Swapping the
    // axes would silently query a point in the Indian Ocean.
    expect(minLat).toBeLessThan(47.485);
    expect(maxLat).toBeGreaterThan(47.485);
    expect(minLon).toBeLessThan(-3.075);
    expect(maxLon).toBeGreaterThan(-3.075);
    expect(url.searchParams.get("crs")).toBe("EPSG:4326");
  });
});

describe("depthGridKey", () => {
  it("collapses points inside one ~110 m DTM cell", () => {
    expect(depthGridKey(47.4851, -3.0751)).toBe(depthGridKey(47.48512, -3.07509));
  });

  it("keeps separate cells apart", () => {
    expect(depthGridKey(47.485, -3.075)).not.toBe(depthGridKey(47.487, -3.075));
  });
});
