// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import type L from "leaflet";
import { createMapZoomStore } from "./mapZoomStore";

/** The few methods of a Leaflet map the store uses, zooming by whole steps
    between 0 and 18 like the basemap. */
function fakeMap(start: number) {
  let zoom = start;
  const handlers = new Map<string, () => void>();
  const fire = () => handlers.get("zoomend zoomlevelschange")?.();
  const map = {
    getZoom: () => zoom,
    getMinZoom: () => 0,
    getMaxZoom: () => 18,
    zoomIn: vi.fn(() => { zoom = Math.min(18, zoom + 1); fire(); }),
    zoomOut: vi.fn(() => { zoom = Math.max(0, zoom - 1); fire(); }),
    on: (types: string, fn: () => void) => { handlers.set(types, fn); },
    off: (types: string) => { handlers.delete(types); },
  };
  return map as unknown as L.Map & { zoomIn: ReturnType<typeof vi.fn> };
}

describe("createMapZoomStore", () => {
  it("offers both ways until a bound is reached, then only the way back (#470)", () => {
    const store = createMapZoomStore();
    expect(store.getSnapshot()).toEqual({ canZoomIn: false, canZoomOut: false });

    const map = fakeMap(17);
    store.attach(map);
    expect(store.getSnapshot()).toEqual({ canZoomIn: true, canZoomOut: true });

    store.zoomIn();
    expect(map.getZoom()).toBe(18);
    expect(store.getSnapshot()).toEqual({ canZoomIn: false, canZoomOut: true });

    for (let i = 0; i < 20; i++) store.zoomOut();
    expect(store.getSnapshot()).toEqual({ canZoomIn: true, canZoomOut: false });
  });

  it("tells its readers when the answer changes, and only then", () => {
    const store = createMapZoomStore();
    const map = fakeMap(10);
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.attach(map);
    expect(onChange).toHaveBeenCalledTimes(1);
    store.zoomIn();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("goes quiet once the map is gone", () => {
    const store = createMapZoomStore();
    const map = fakeMap(10);
    const detach = store.attach(map);
    detach();
    expect(store.getSnapshot()).toEqual({ canZoomIn: false, canZoomOut: false });
    store.zoomIn();
    expect(map.zoomIn).not.toHaveBeenCalled();
  });
});
