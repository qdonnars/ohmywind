import { useCallback, useState } from "react";
import type { MapView } from "../utils/mapViewParams";

/** ~1.1 km. Finer than that changes nothing for a search bias or for
    restoring a viewport, and every extra digit is a React render on every
    pan. */
export function roundView(view: MapView): MapView {
  return {
    lat: Math.round(view.lat * 100) / 100,
    lon: Math.round(view.lon * 100) / 100,
    zoom: Math.round(view.zoom),
  };
}

/**
 * Tracks where the map is looking.
 *
 * Feeds two things: the search proximity bias, and the view handed to the
 * other page so switching between forecast and planner leaves the camera
 * where it was. The identity of the returned view is stable while the
 * rounded position holds, so nudging the map neither re-renders the page nor
 * invalidates the search cache.
 */
export function useMapView() {
  const [view, setView] = useState<MapView | null>(null);

  const onViewChange = useCallback((raw: MapView) => {
    setView((prev) => {
      const next = roundView(raw);
      if (prev && prev.lat === next.lat && prev.lon === next.lon && prev.zoom === next.zoom) {
        return prev;
      }
      return next;
    });
  }, []);

  return { view, onViewChange };
}
