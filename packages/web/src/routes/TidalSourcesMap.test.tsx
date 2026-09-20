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
const FILES: Record<string, unknown> = {
  "mask_atlne.geojson": {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { threshold_kt: 1.5 }, geometry: { type: "Polygon", coordinates: [[[-5, 48], [-4, 48], [-4, 49], [-5, 49], [-5, 48]]] } },
    ],
  },
  "gazetteer.geojson": {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-4.77, 48.04] },
        properties: { name: "Raz de Sein", country: "France", max_spring_kt: 6, max_spring_text: "6", confidence: "medium", source_url: null, coverage_class: "fine", best_source: "SHOM", candidates: [], in_objective: true },
      },
    ],
  },
  "gaps_mask.geojson": empty,
  "objective.geojson": empty,
  "coverage_effective.geojson": empty,
  "coverage_spike.geojson": empty,
  "sources.geojson": empty,
  "shom_points.json": { zones: ["shom_c2d_560_sein"], mean_lat: 48, points: [[48.04, -4.77, 0]] },
  "atlne_footprint.geojson": empty,
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

  it("draws the map, loads every layer file and lists the three legend groups", async () => {
    const { TidalSourcesMap } = await import("./TidalSourcesMap");
    const { container } = render(<TidalSourcesMap />);
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector(".leaflet-container")).not.toBeNull();
    const fetched = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    for (const name of Object.keys(FILES)) expect(fetched.some((u) => u.endsWith(name))).toBe(true);
    expect(screen.getByText(/1\. Où il y a du courant/)).toBeTruthy();
    expect(screen.getByText(/2\. Ce que l'application utilise/)).toBeTruthy();
    expect(screen.getByText(/3\. Ce qui manque/)).toBeTruthy();
    expect(container.querySelector(".methodo-map-canvas")?.getAttribute("aria-busy")).toBe("false");
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
    expect(container.querySelector(".leaflet-popup-content")?.textContent).toContain("marc_finis_250m");
  });
});
