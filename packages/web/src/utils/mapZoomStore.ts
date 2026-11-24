// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type L from "leaflet";

/** What the zoom buttons need to know about the map: whether each way still
    leads somewhere. Both false until a map is attached. */
interface ZoomSnapshot {
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const DETACHED: ZoomSnapshot = { canZoomIn: false, canZoomOut: false };

/** Below this gap a zoom counts as being at its bound: with a zoom snap of
    a tenth, a level a hair under the maximum is the maximum. */
const AT_BOUND = 1e-6;

export interface MapZoomStore {
  /** Called by the map component once its Leaflet map exists, from the
      effect that creates it. Returns the detach function for its cleanup. */
  attach: (map: L.Map) => () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => ZoomSnapshot;
}

/**
 * The link between a Leaflet map and its zoom buttons.
 *
 * A store rather than the map handed down as a prop: the map is created in
 * the map component's own effect, which runs after its children's, so a
 * child could not reach it on mount, and keeping the map in React state
 * would mean setting state from that effect. The store is created once per
 * map component, the map attaches to it when it exists, and the buttons read
 * it through `useSyncExternalStore`.
 */
export function createMapZoomStore(): MapZoomStore {
  let map: L.Map | null = null;
  let snapshot: ZoomSnapshot = DETACHED;
  const listeners = new Set<() => void>();
  const publish = (next: ZoomSnapshot) => {
    if (next.canZoomIn === snapshot.canZoomIn && next.canZoomOut === snapshot.canZoomOut) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const update = () => {
    if (!map) return;
    const zoom = map.getZoom();
    publish({
      canZoomIn: zoom < map.getMaxZoom() - AT_BOUND,
      canZoomOut: zoom > map.getMinZoom() + AT_BOUND,
    });
  };
  return {
    attach(next) {
      map = next;
      next.on("zoomend zoomlevelschange", update);
      update();
      return () => {
        next.off("zoomend zoomlevelschange", update);
        if (map === next) map = null;
        publish(DETACHED);
      };
    },
    zoomIn: () => map?.zoomIn(),
    zoomOut: () => map?.zoomOut(),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => snapshot,
  };
}
