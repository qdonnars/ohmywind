// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The vector basemap needs WebGL and a worker: neither exists under jsdom,
// and the map's own behaviour is what this test looks at.
vi.mock("../utils/basemapLayer", () => ({
  addBasemap: () => ({ setTheme: () => undefined, remove: () => undefined }),
  BASEMAP_MAX_ZOOM: 18,
}));

const empty = { type: "FeatureCollection", features: [] };
const square = (x: number, y: number) => ({ type: "Polygon", coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
const FILES: Record<string, unknown> = {
  "gazetteer.geojson": {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-4.77, 48.04] },
        properties: { name: "Raz de Sein", status: "covered", country: "France", max_spring_kt: 6, max_spring_text: "6", confidence: "medium", source_url: null, coverage_class: "fine", best_source: "SHOM", candidates: [], in_objective: true },
      },
    ],
  },
  "status.geojson": {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { status: "covered", min_kt: 2, area_deg2: 1 }, geometry: square(-5, 48) },
      { type: "Feature", properties: { status: "blocked", area_deg2: 1 }, geometry: square(-4, 58) },
    ],
  },
  "objective.geojson": empty,
  "sources.geojson": {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: square(4, 58),
        properties: { id: "norkyst800", name: "NorKyst800 (MET Norway)", provider: "MET Norway", status: "ok", kind: "forecast_grid", resolution_m: 800, access: "THREDDS sans clé", licence: "CC BY 4.0", licence_url: "https://example.org/licence", licence_read_at: "2026-09-19", atlases: ["NORKYST"] },
      },
    ],
  },
};

describe("TidalSourcesMap", () => {
  beforeEach(() => {
    // jsdom has no 2D canvas; Leaflet's canvas renderer (the SHOM points)
    // only needs a context that swallows every call.
    HTMLCanvasElement.prototype.getContext = (() =>
      new Proxy({}, { get: () => () => undefined })) as unknown as HTMLCanvasElement["getContext"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const name = Object.keys(FILES).find((n) => url.endsWith(n));
        if (name) return new Response(JSON.stringify(FILES[name]), { status: 200 });
        if (url.includes("/api/v1/marine/marc/coverage")) {
          // The server says it serves a NorKyst atlas: the registry row must
          // badge "in the cascade" whatever its static licence status.
          // Two atlases hold the map centre; the overlay answers with the
          // fine one, the coarse one must show as passed over.
          const world: [number, number, number, number] = [-80, -180, 85, 180];
          return new Response(
            JSON.stringify({
              atlases: [
                { name: "NORKYST", source: "norkyst", bbox: [60, 4, 71, 31], cells: [] },
                { name: "FINIS", source: "marc", label: "marc_finis_250m", rank: 2, resolution_m: 250, confidence: "high", bbox: world, cells: [world] },
                { name: "ATLNE", source: "marc", label: "marc_atlne_2000m", rank: 1, resolution_m: 2000, confidence: "medium", bbox: world, cells: [world] },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/v1/marine/marc")) {
          return new Response(JSON.stringify({ covered: true, current_source: "marc_finis_250m", atlas_resolution_m: 250 }), { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("draws the map, loads every layer file and shows the four statuses with the registry", async () => {
    const { TidalSourcesMap } = await import("./TidalSourcesMap");
    const { container } = render(<TidalSourcesMap />);
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector(".leaflet-container")).not.toBeNull();
    const fetched = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    for (const name of Object.keys(FILES)) expect(fetched.some((u) => u.endsWith(name))).toBe(true);
    expect(screen.getByText(/Courant de marée calculé depuis les atlas/)).toBeTruthy();
    expect(screen.getByText(/^Couvert :/)).toBeTruthy();
    expect(screen.getByText(/source ouverte identifiée$/)).toBeTruthy();
    expect(screen.getByText(/fermées ou à clarifier$/)).toBeTruthy();
    expect(screen.getByText(/Plus de 1,5 kt non couvert, aucune source connue$/)).toBeTruthy();
    expect(container.querySelector(".methodo-map-canvas")?.getAttribute("aria-busy")).toBe("false");
    // The registry: one row per source, its box draws the extent, a mailto row last.
    const box = container.querySelector<HTMLInputElement>("#tidal-source-norkyst800");
    expect(box).not.toBeNull();
    expect(screen.getByText("NorKyst800 (MET Norway)")).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const row = screen.getByText("NorKyst800 (MET Norway)").closest("tr")!;
    expect(row.querySelector(".methodo-map-badge")?.textContent).toBe("dans la cascade");
    expect(container.querySelector(".methodo-map-propose a")?.getAttribute("href")).toMatch(/^mailto:contact@ohmywind\.fr\?subject=/);
    const before = container.querySelectorAll(".leaflet-overlay-pane path").length;
    await act(async () => {
      box!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelectorAll(".leaflet-overlay-pane path").length).toBeGreaterThan(before);
  });

  it("asks the server which source applies where the reader clicked", async () => {
    const { TidalSourcesMap } = await import("./TidalSourcesMap");
    const { container } = render(<TidalSourcesMap />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const canvas = container.querySelector(".methodo-map-canvas") as HTMLElement;
    const rect = { left: 0, top: 0, width: 800, height: 500 };
    canvas.getBoundingClientRect = () => ({ ...rect, right: 800, bottom: 500, x: 0, y: 0, toJSON: () => rect });
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent("click", { clientX: 400, clientY: 250, bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });
    const fetched = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    const overlay = fetched.find((u) => u.includes("/api/v1/marine/marc?"));
    expect(overlay).toMatch(/lat=-?\d+\.\d{4}&lon=-?\d+\.\d{4}&start=/);
    const text = container.querySelector(".leaflet-popup-content")?.textContent ?? "";
    expect(text).toContain("marc_finis_250m");
    // The atlas the cascade passed over at this point, with its grid and rank.
    expect(text).toContain("Aussi disponibles ici, écartées");
    expect(text).toContain("marc_atlne_2000m, maille 2 km, rang 1");
    expect(text).not.toContain("marc_finis_250m, maille");
  });
});
