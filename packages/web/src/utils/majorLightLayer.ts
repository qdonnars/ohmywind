// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import L from "leaflet";
import { MAJOR_LIGHTS } from "../data/majorLights";
import { lightSizePx } from "./lightSymbolSize";

/**
 * Landfall lights, drawn as vectors on top of the OpenSeaMap raster.
 *
 * The raster bakes every symbol at one size, so zoomed out to a whole coast
 * a lighthouse is a 9 px speck: the one scale where it matters most is the
 * one where it is least readable. Nothing in a raster tile can be resized,
 * and the tile trick that would double it (``tileSize`` 512 with
 * ``zoomOffset`` -1) only comes in powers of two and blurs what it enlarges.
 * So the lights, and only the lights, are drawn again as SVG we control.
 *
 * The symbol matches the chart language the raster already speaks: a black
 * star with a magenta flare, sitting exactly on the raster star it covers.
 * That is why it can stay visible at every zoom without doubling up: as it
 * shrinks it lands on its raster twin, so there is no threshold to pop
 * across.
 */

/** Above the seamark raster (250), below the planned route (400). */
const PANE = "majorLights";

/** Read by the icon CSS. One write per zoom step resizes all 157 symbols,
    which is why the size lives in a custom property rather than in each
    icon's markup. */
const SIZE_VAR = "--ow-light-size";

// Five-point star on a 24x24 box, centred, plus the magenta flare charts put
// on a lit mark. The white stroke is what keeps the black star readable on
// the dark basemap: same job as the halo under the raster, but crisp,
// because here we own the geometry.
const LIGHT_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path class="ow-light-flare" d="M13.9 10.1 22 2l-6 10.2z"/>' +
  '<path class="ow-light-star" d="M12 3.2l2.1 6.4h6.7l-5.4 3.9 2.1 6.4-5.5-3.9-5.5 3.9 2.1-6.4-5.4-3.9h6.7z"/>' +
  "</svg>";

/** Anchored at [0, 0] with the symbol centred by CSS transform: the size
    changes on every zoom, and an icon that centres itself never needs its
    anchor recomputed. */
const ICON = L.divIcon({
  html: `<span class="ow-light">${LIGHT_SVG}</span>`,
  className: "",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export interface MajorLightHandle {
  layer: L.LayerGroup;
  /** Unsubscribes the zoom listener. Removing the layer alone would leave
      it firing against a map that no longer shows anything. */
  detach: () => void;
}

/**
 * Idempotently reflect `enabled` onto the map. Same shape as
 * ``syncSeamarkLayer``, which owns the raster underneath.
 */
export function syncMajorLightLayer(
  map: L.Map,
  handleRef: { current: MajorLightHandle | null },
  enabled: boolean,
): void {
  if (!enabled) {
    handleRef.current?.detach();
    handleRef.current?.layer.remove();
    handleRef.current = null;
    return;
  }
  if (handleRef.current) {
    if (map.hasLayer(handleRef.current.layer)) return;
    // The ref outlived the map it was attached to: both map components
    // rebuild their map on remount, and React StrictMode does it on every
    // dev mount. Same trap as the raster layer.
    handleRef.current.detach();
    handleRef.current.layer.remove();
    handleRef.current = null;
  }

  let pane = map.getPane(PANE);
  if (!pane) {
    pane = map.createPane(PANE);
    pane.style.zIndex = "260";
    // Decorative: a click here belongs to the basemap, which is what adds a
    // waypoint on /plan. A lighthouse must never swallow that.
    pane.style.pointerEvents = "none";
  }

  const applySize = () => {
    pane.style.setProperty(SIZE_VAR, `${lightSizePx(map.getZoom())}px`);
  };
  applySize();
  map.on("zoomend", applySize);

  const layer = L.layerGroup(
    MAJOR_LIGHTS.map(([lat, lon]) =>
      L.marker([lat, lon], { icon: ICON, pane: PANE, interactive: false }),
    ),
  ).addTo(map);

  handleRef.current = {
    layer,
    detach: () => map.off("zoomend", applySize),
  };
}
