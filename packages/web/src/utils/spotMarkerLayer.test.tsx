// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { spotKey, syncSpotMarkers } from "./spotMarkerLayer";
import { SPOT_HIT_RADIUS_PX } from "../domain/gestures";
import type { Spot } from "../types";

const AT = { latitude: 43.2965, longitude: 5.37 };

describe("syncSpotMarkers", () => {
  let container: HTMLDivElement;
  let map: L.Map;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    map = L.map(container, { center: [AT.latitude, AT.longitude], zoom: 9 });
  });
  afterEach(() => {
    map.remove();
    container.remove();
  });

  function sync(spots: Spot[], state: { markers: Map<string, L.CircleMarker>; elementToSpot: Map<Element, Spot> }, onSelect = vi.fn()) {
    syncSpotMarkers({ map, ...state, spots, current: null, onSelect });
    return onSelect;
  }

  it("keeps the marker of a renamed spot but hands back the new name", () => {
    const state = { markers: new Map<string, L.CircleMarker>(), elementToSpot: new Map<Element, Spot>() };
    const before: Spot = { ...AT, name: "Vieux-Port" };
    sync([before], state);
    const marker = state.markers.get(spotKey(before))!;
    expect(marker.getTooltip()?.getContent()).toBe("Vieux-Port");

    // Same point, new name: the marker is reused, and everything it says or
    // hands back about the spot follows the rename without a reload (#412).
    const after: Spot = { ...AT, name: "Frioul" };
    const onSelect = sync([after], state);
    expect(state.markers.get(spotKey(after))).toBe(marker);
    expect(marker.getTooltip()?.getContent()).toBe("Frioul");
    expect([...state.elementToSpot.values()]).toEqual([after]);
    marker.fire("click");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(after);
  });

  it("widens a marker's target under a finger, without drawing it bigger (#422)", () => {
    // jsdom has no matchMedia: lend a coarse pointer, as a phone reports.
    window.matchMedia = (query: string) =>
      ({ matches: query === "(pointer: coarse)" }) as unknown as MediaQueryList;
    try {
      const state = { markers: new Map<string, L.CircleMarker>(), elementToSpot: new Map<Element, Spot>() };
      const spot: Spot = { ...AT, name: "Vieux-Port" };
      sync([spot], state);
      const marker = state.markers.get(spotKey(spot))!;
      const layers: L.CircleMarker[] = [];
      map.eachLayer((l) => {
        if (l instanceof L.CircleMarker) layers.push(l);
      });
      const hit = layers.find((l) => l !== marker)!;
      expect(layers).toHaveLength(2);
      expect(hit.getRadius()).toBe(SPOT_HIT_RADIUS_PX);
      expect(hit.getRadius()).toBeGreaterThan(marker.getRadius());
      expect(hit.options.stroke).toBe(false);
      expect(hit.options.fillOpacity).toBe(0);

      // A tap on it is a tap on the spot, and a long press too. It follows
      // a rename like the dot does.
      const renamed: Spot = { ...AT, name: "Frioul" };
      const onSelect = sync([renamed], state);
      hit.fire("click");
      expect(onSelect).toHaveBeenCalledWith(renamed);
      expect([...state.elementToSpot.values()]).toEqual([renamed, renamed]);

      // And it goes with the spot.
      sync([], state);
      expect(map.hasLayer(hit)).toBe(false);
      expect(state.elementToSpot.size).toBe(0);
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("names a numbered marker by its rank and keeps the name for assistive tech", () => {
    const state = { markers: new Map<string, L.CircleMarker>(), elementToSpot: new Map<Element, Spot>() };
    const spot: Spot = { ...AT, name: "Vieux-Port" };
    const numbers = new Map([[spotKey(spot), 2]]);
    syncSpotMarkers({ map, ...state, spots: [spot], current: null, onSelect: vi.fn(), numbers });
    const marker = state.markers.get(spotKey(spot))!;
    expect(marker.getTooltip()?.getContent()).toBe("2");
    const renamed: Spot = { ...AT, name: "Frioul" };
    syncSpotMarkers({ map, ...state, spots: [renamed], current: null, onSelect: vi.fn(), numbers });
    expect(marker.getTooltip()?.getContent()).toBe("2");
    const [el] = state.elementToSpot.keys();
    expect(el.getAttribute("aria-label")).toBe("Frioul");
  });
});
