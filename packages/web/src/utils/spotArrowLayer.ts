// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The arrow overlay as a Leaflet layer.
 *
 * Split from `spotArrows.ts`, which stays free of Leaflet: the geometry and
 * the label relaxation are pure functions of numbers, and their tests run in
 * Node without a DOM. Only this file needs a map.
 */

import L from "leaflet";
import type { MarineHourly, MetricView, ModelForecast, Spot } from "../types";
import {
  arrowsSvg,
  currentArrowItems,
  SPOT_CX,
  SPOT_CY,
  waveArrowItems,
  windArrowItems,
  type ArrowItem,
} from "./spotArrows";

/** Name of the Leaflet pane the arrows live in, created by the map owner. */
export const ARROW_PANE = "windArrows";

/**
 * Reconcile the arrow overlay with what should be drawn, in the shape the
 * other map layers use (`syncUserPositionLayer`, `syncSeamarkLayer`).
 *
 * The arrows ride in their own pane, below the markers and above the basemap,
 * and are never interactive: they are a reading of the hour, not a target.
 */
export function syncSpotArrowLayer(
  map: L.Map,
  layerRef: { current: L.Marker | null },
  opts: {
    current: Spot | null;
    selectedHour: string | null;
    metric: MetricView;
    forecasts: ModelForecast[];
    marine: MarineHourly | null;
    color: string;
  },
): void {
  layerRef.current?.remove();
  layerRef.current = null;

  const { current, selectedHour, metric, forecasts, marine, color } = opts;
  if (!selectedHour || !current) return;

  let items: ArrowItem[] = [];
  if (metric === "wind") {
    items = windArrowItems(forecasts, selectedHour, color);
  } else if (metric === "waves" && marine) {
    items = waveArrowItems(marine, selectedHour, color);
  } else if (metric === "currents" && marine) {
    items = currentArrowItems(marine, selectedHour, color);
  }
  // metric === "tides": scalar, no arrow.

  const html = arrowsSvg(items);
  if (!html) return;

  layerRef.current = L.marker([current.latitude, current.longitude], {
    icon: L.divIcon({
      html,
      className: "",
      iconSize: [300, 300],
      iconAnchor: [SPOT_CX, SPOT_CY],
    }),
    interactive: false,
    pane: ARROW_PANE,
  }).addTo(map);
}
