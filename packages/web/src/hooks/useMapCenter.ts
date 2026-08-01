import { useCallback, useState } from "react";

/** ~1.1 km. Finer than that changes nothing for a search bias, and every
    extra digit is a React render on every pan. */
export function roundCenter(center: { lat: number; lon: number }): {
  lat: number;
  lon: number;
} {
  return {
    lat: Math.round(center.lat * 100) / 100,
    lon: Math.round(center.lon * 100) / 100,
  };
}

/**
 * Tracks where the map is looking, for pages that feed it to the search.
 *
 * The identity of the returned center is stable while the rounded position
 * does not change, so nudging the map by a few metres does not re-render the
 * page or invalidate the search cache.
 */
export function useMapCenter() {
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);

  const onCenterChange = useCallback((raw: { lat: number; lon: number }) => {
    setCenter((prev) => {
      const next = roundCenter(raw);
      if (prev && prev.lat === next.lat && prev.lon === next.lon) return prev;
      return next;
    });
  }, []);

  return { center, onCenterChange };
}
