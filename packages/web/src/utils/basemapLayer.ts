// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The basemap, i.e. the coastline both maps are drawn on.
 *
 * Served by OpenFreeMap: vector tiles of the OpenStreetMap planet, no API
 * key, no account, no quota. We came here from CARTO, which used to serve
 * the same Positron look as plain raster and then started stamping
 * "API KEY REQUIRED" across every tile. Trading one keyless third party for
 * another would only reschedule that outage, so the criterion for the
 * replacement was that nothing about it can be revoked: OpenFreeMap's tiles
 * are public, its styles are open, and the whole stack is self-hostable the
 * day we need it to be.
 *
 * Vector rather than raster is the cost of that move. It buys crisp labels
 * at any pixel ratio and a real dark style, and it charges MapLibre GL in
 * the bundle plus a WebGL2 context per map. MapLibre renders inside Leaflet
 * through ``maplibre-gl-leaflet`` rather than replacing it: the layer lands
 * in ``tilePane`` (z-index 200), so the seamark overlay, the route and every
 * marker keep their panes and their code untouched.
 */
import L from "leaflet";
import { setWorkerUrl, type FilterSpecification, type Map as MaplibreMap } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";

// MapLibre 6 parses tiles in a worker it loads from a sibling file, resolved
// at runtime off ``import.meta.url``. No bundler can see through that, so
// nothing emitted the worker and its request fell through to the SPA
// fallback: the worker was handed index.html, died without a word, and the
// map painted its background colour and not one tile. ``?worker&url`` has
// Vite bundle the worker (it pulls in a shared chunk of its own, so copying
// the single file is not enough) and hand back the URL to point MapLibre at.
setWorkerUrl(maplibreWorkerUrl);

export type BasemapTheme = "light" | "dark";

/** Positron is the style CARTO's ``light_all`` was itself derived from, so
    the light map is the one users already know. ``dark`` is OpenFreeMap's
    own, and reads darker than ``dark_all`` did. */
const STYLE_URLS: Record<BasemapTheme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/**
 * The sea, in dark mode.
 *
 * OpenFreeMap's dark style paints water rgb(27,27,29) over rgb(12,12,12)
 * land: fifteen values apart, on a map whose entire job is to show a sailor
 * where the water stops. Vector styling is what makes this fixable at all,
 * so we spend it here. The tone is lifted from the app's own dark palette
 * (between ``--ow-bg-0`` and ``--ow-bg-2``), which reads as sea because it
 * is blue rather than because it is bright.
 */
const DARK_SEA = "#13212f";

/** Keyless raster, used only when WebGL2 is missing (see ``addBasemap``).
    Volume there is a rounding error, which is what keeps this within the
    OSMF tile usage policy. */
const FALLBACK_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Deepest zoom either map allows. Used to be inherited from the raster tile
    layer's ``maxZoom``; a GL layer is not a grid layer and contributes no
    zoom bound, so both maps now have to declare it themselves. */
export const BASEMAP_MAX_ZOOM = 19;

export interface Basemap {
  /** Swap light/dark in place. Replaces the old ``setUrl`` on the raster
      layer. */
  setTheme(theme: BasemapTheme): void;
}

/** MapLibre needs WebGL2, so a context that isn't WebGL2 is no context at
    all. Asking is cheap and the answer decides whether the user gets a map
    or an empty rectangle. */
function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * Attach the basemap to `map` and hand back the handle used to follow the
 * theme. The layer is removed with the map itself: ``map.remove()`` triggers
 * ``onRemove``, which disposes the GL map and frees its WebGL context.
 */
/**
 * Drop the administrative boundaries drawn out over the sea.
 *
 * OpenStreetMap continues a country's or a region's boundary across the
 * water, tagged ``maritime=1``: territorial waters, and the offshore
 * extension of the French régions. Positron filters those out of all three
 * of its boundary layers; the dark style filters none of them, so switching
 * to dark drew a line running parallel to the coast a dozen miles out. On a
 * chart, a line on the water reads as something a boat should care about,
 * and this one is a jurisdiction, not a hazard.
 *
 * Applied to every layer reading the ``boundary`` source rather than to the
 * three ids the dark style ships today, so a restyle upstream cannot quietly
 * bring the line back. Boundaries on land are left alone: they cost nothing
 * and they place a coastline.
 */
function hideMaritimeBoundaries(glMap: MaplibreMap): void {
  const style = glMap.getStyle();
  for (const layer of style?.layers ?? []) {
    if (!("source-layer" in layer) || layer["source-layer"] !== "boundary") continue;
    const notMaritime = ["!=", ["get", "maritime"], 1];
    const existing = "filter" in layer ? layer.filter : undefined;
    glMap.setFilter(
      layer.id,
      (existing ? ["all", notMaritime, existing] : notMaritime) as FilterSpecification,
    );
  }
}

export function addBasemap(map: L.Map, theme: BasemapTheme): Basemap {
  let current = theme;

  if (!hasWebGL2()) {
    // No usable GL context: a blank map would leave the markers and the
    // route floating over nothing. Raster OSM is the ugly duckling but it
    // draws a coastline on anything with a canvas, and both themes get the
    // same one, hence the no-op setTheme.
    L.tileLayer(FALLBACK_URL, { maxZoom: BASEMAP_MAX_ZOOM }).addTo(map);
    return { setTheme: () => {} };
  }

  let glMap: MaplibreMap | null = null;

  // Deferred until the map has a view. Leaflet defers ``onAdd`` the same way,
  // and the GL layer reads the centre and zoom the moment it is added, so on
  // /plan (which builds its map first and aims it after) the layer was still
  // unbuilt when we asked it for its MapLibre map, and the page died on a
  // blank screen. ``whenReady`` runs inline when the view is already set, so
  // the explore map is unaffected.
  map.whenReady(() => {
    glMap = L.maplibreGL({ style: STYLE_URLS[current] }).addTo(map).getMaplibreMap();
    // Re-applied on every style load rather than once: switching theme swaps
    // the whole style document, which drops any paint property set on the
    // one before it.
    glMap.on("style.load", () => {
      if (!glMap) return;
      hideMaritimeBoundaries(glMap);
      if (current !== "dark") return;
      if (glMap.getLayer("water")) glMap.setPaintProperty("water", "fill-color", DARK_SEA);
      if (glMap.getLayer("waterway")) glMap.setPaintProperty("waterway", "line-color", DARK_SEA);
    });
  });

  return {
    setTheme: (next) => {
      // Also read by the deferred build above, so a theme switched before the
      // map had a view still lands on the right style.
      current = next;
      glMap?.setStyle(STYLE_URLS[next]);
    },
  };
}
