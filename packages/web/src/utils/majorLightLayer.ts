// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import L from "leaflet";
import { MAJOR_LIGHTS, type FlareColour } from "../data/majorLights";
import { flareSizePx, STAR_SIZE_PX } from "./lightSymbolSize";

/**
 * Landfall lights, drawn as vectors on top of the OpenSeaMap raster.
 *
 * The raster bakes every symbol at one size, so zoomed out to a whole coast
 * the flare that says "a light burns here" is a few pixels, at the one
 * scale where a landfall light matters most. Nothing in a raster tile can
 * be resized, and the tile trick that would double it (``tileSize`` 512
 * with ``zoomOffset`` -1) only comes in powers of two, blurs what it
 * enlarges, and would inflate every rock and buoy along with it.
 *
 * So the lights, and only the lights, are drawn again as SVG we control.
 * The star keeps the raster's size: it marks a position, and enlarging it
 * says nothing the raster did not already say. The flare is what grows.
 *
 * Both follow the chart language the raster already speaks, down to the
 * colour rule (see ``FlareColour``), so as the flare shrinks back to raster
 * size it lands on its raster twin and there is no threshold to pop across.
 */

/** Above the seamark raster (250), below the planned route (400). */
const PANE = "majorLights";

/** Read by the icon CSS. One write per zoom step resizes every flare, which
    is why the size lives in a custom property rather than in each icon. */
const FLARE_VAR = "--ow-flare-size";

/** Five-point star on a 24x24 box, centred. Constant size, so it is carried
    by the shared icon rather than rebuilt per light. */
const STAR_SVG =
  '<svg class="ow-light-star-svg" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path class="ow-light-star" d="M12 3.2l2.1 6.4h6.7l-5.4 3.9 2.1 6.4-5.5-3.9-5.5 3.9 2.1-6.4-5.4-3.9h6.7z"/>' +
  "</svg>";

/**
 * The flare: a teardrop whose tip sits on the light and whose bulb falls
 * away to the lower right, which is the direction and shape OpenSeaMap
 * draws, checked against its own tiles at Créac'h and Brescou. Its box is
 * anchored by its top-left corner so growing it extends the tail outward
 * and never walks the tip off the light.
 */
const FLARE_SVG = (colour: FlareColour) =>
  `<svg class="ow-light-flare-svg ow-flare-${colour}" viewBox="0 0 24 24" aria-hidden="true">` +
  '<path class="ow-light-flare" d="M1 1c8 4 15 10 19.5 15.5 2.5 3-.5 6.5-4 4C11 16 5 9 1 1z"/>' +
  "</svg>";

/** One icon per colour rather than per light: 232 markers share four. */
const ICONS: Record<FlareColour, L.DivIcon> = {
  y: buildIcon("y"),
  r: buildIcon("r"),
  g: buildIcon("g"),
  m: buildIcon("m"),
};

function buildIcon(colour: FlareColour): L.DivIcon {
  return L.divIcon({
    // Anchored at [0, 0] with the parts placed by CSS transform: the flare
    // changes size on every zoom, and a symbol that positions itself never
    // needs its anchor recomputed.
    html: `<span class="ow-light">${FLARE_SVG(colour)}${STAR_SVG}</span>`,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

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
    pane.style.setProperty("--ow-star-size", `${STAR_SIZE_PX}px`);
  }

  const applySize = () => {
    pane.style.setProperty(FLARE_VAR, `${flareSizePx(map.getZoom())}px`);
  };
  applySize();
  map.on("zoomend", applySize);

  const layer = L.layerGroup(
    MAJOR_LIGHTS.map(([lat, lon, colour]) =>
      L.marker([lat, lon], { icon: ICONS[colour], pane: PANE, interactive: false }),
    ),
  ).addTo(map);

  handleRef.current = {
    layer,
    detach: () => map.off("zoomend", applySize),
  };
}
