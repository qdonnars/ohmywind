// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearReverseGeocodeCache, coordinateName, reverseGeocode } from "./reverseGeocode";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  clearReverseGeocodeCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reverseGeocode", () => {
  it("identifies the application, as the Nominatim policy asks", async () => {
    const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ address: { city: "Marseille" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await reverseGeocode(43.29, 5.37);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("nominatim.openstreetmap.org/reverse");
    expect(url).toContain("email=contact%40ohmywind.fr");
  });

  it("prefers the most specific place name available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ address: { village: "Le Brusc", county: "Var" } })),
    );
    expect(await reverseGeocode(43.06, 5.8)).toBe("Le Brusc");
  });

  it("falls back down the address ladder, then to the display name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ display_name: "Rade de Toulon, Var, France" })),
    );
    expect(await reverseGeocode(43.1, 5.9)).toBe("Rade de Toulon");
  });

  it("falls back to the coordinates when the answer names nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await reverseGeocode(42.5, 6.25)).toBe(coordinateName(42.5, 6.25));
  });

  it("falls back to the coordinates on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await reverseGeocode(42.5, 6.25)).toBe("42.500, 6.250");
  });

  it("falls back to the coordinates on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
    expect(await reverseGeocode(42.5, 6.25)).toBe("42.500, 6.250");
  });

  it("caches a hit, so pressing around the same bay costs one request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ address: { city: "Marseille" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reverseGeocode(43.2900, 5.3700)).toBe("Marseille");
    // Same point to within the cache resolution (~100 m).
    expect(await reverseGeocode(43.29004, 5.37002)).toBe("Marseille");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure: the next press retries", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchMock);
    await reverseGeocode(43.29, 5.37);
    await reverseGeocode(43.29, 5.37);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves to the coordinates when the caller aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        init?.signal?.throwIfAborted();
        return jsonResponse({ address: { city: "Marseille" } });
      }),
    );
    const controller = new AbortController();
    controller.abort();
    expect(await reverseGeocode(43.29, 5.37, controller.signal)).toBe("43.290, 5.370");
  });
});

describe("coordinateName", () => {
  it("keeps three decimals, about 100 m", () => {
    expect(coordinateName(43.296123, 5.369987)).toBe("43.296, 5.370");
  });
});
