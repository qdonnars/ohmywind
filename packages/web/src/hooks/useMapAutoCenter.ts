// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useRef, type RefObject } from "react";
import type L from "leaflet";
import { centerForBottomInset } from "../utils/visibleCenter";

/**
 * Centring a point on a map whose bottom edge is covered by a data panel.
 *
 * The forecast tables sit over the bottom of the map. Centring a spot on the
 * container therefore hides it behind them: what has to be centred is the
 * strip left visible above the panel (issue #218).
 *
 * The hard part is that the panel's height at the moment a camera move starts
 * is not its final height. The loading skeleton gives way to tables of varying
 * height once the forecast lands, and the difference pushes the point off the
 * strip's centre by half of it. So every auto-centre records its intent here,
 * and a ResizeObserver on the panel re-aims the camera once the height
 * settles. Mid-flight, the correction re-issues the fly with the time it has
 * left, so it reads as one continuous move rather than two.
 *
 * A drag ends the intent: from then on the viewport belongs to the user, and a
 * panel resize must not take it back. A zoom does not, because zooming around
 * a centred point is still looking at that point.
 */

/** Zoom and duration of a "fly to this point" camera move. */
export const FLY_ZOOM = 10;
export const FLY_MS = 1200;

interface AutoCenterIntent {
  lat: number;
  lon: number;
  zoom: number;
  insetPx: number;
  /** Epoch ms when the flyTo animation lands; 0 for plain pans. */
  flyEndsAt: number;
}

interface MapAutoCenter {
  /** Where the map centre has to be for `(lat, lon)` to land in the visible
      strip. For the initial `setView`, before any map exists. */
  visibleCenter: (lat: number, lon: number, zoom: number) => [number, number];
  /** Move the camera onto a point, and remember that we did. */
  autoCenter: (map: L.Map, lat: number, lon: number, mode: "pan" | "fly") => void;
  /** Record an intent for a camera position that was set directly, so a panel
      resize still re-aims it. Used for the map's initial view. */
  seed: (lat: number, lon: number, zoom: number) => void;
  /** Forget the intent: the viewport is the user's now. */
  clear: () => void;
  /** Start watching the panel for the given map. Returns the teardown. */
  observe: (map: L.Map) => () => void;
}

export function useMapAutoCenter(
  bottomInsetRef: RefObject<HTMLElement | null> | undefined,
): MapAutoCenter {
  const intentRef = useRef<AutoCenterIntent | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const observedElRef = useRef<Element | null>(null);

  const insetPx = useCallback(
    () => bottomInsetRef?.current?.offsetHeight ?? 0,
    [bottomInsetRef],
  );

  // The observer wants the element, but the data area is unmounted while no
  // spot is active, so each auto-centre re-points it at whichever node
  // currently renders the panel instead of observing once at mount.
  const ensureObserved = useCallback(() => {
    const el = bottomInsetRef?.current ?? null;
    const ro = roRef.current;
    if (!ro || el === observedElRef.current) return;
    if (observedElRef.current) ro.unobserve(observedElRef.current);
    observedElRef.current = el;
    if (el) ro.observe(el);
  }, [bottomInsetRef]);

  const visibleCenter = useCallback(
    (lat: number, lon: number, zoom: number): [number, number] => {
      const c = centerForBottomInset(lat, lon, zoom, insetPx());
      return [c.lat, c.lon];
    },
    [insetPx],
  );

  const autoCenter = useCallback(
    (map: L.Map, lat: number, lon: number, mode: "pan" | "fly") => {
      ensureObserved();
      const inset = insetPx();
      const zoom = mode === "fly" ? FLY_ZOOM : map.getZoom();
      const c = centerForBottomInset(lat, lon, zoom, inset);
      intentRef.current = {
        lat,
        lon,
        zoom,
        insetPx: inset,
        flyEndsAt: mode === "fly" ? Date.now() + FLY_MS : 0,
      };
      if (mode === "fly") {
        map.flyTo([c.lat, c.lon], zoom, { duration: FLY_MS / 1000 });
      } else {
        map.panTo([c.lat, c.lon], { animate: true });
      }
    },
    [ensureObserved, insetPx],
  );

  const seed = useCallback(
    (lat: number, lon: number, zoom: number) => {
      intentRef.current = { lat, lon, zoom, insetPx: insetPx(), flyEndsAt: 0 };
    },
    [insetPx],
  );

  const clear = useCallback(() => {
    intentRef.current = null;
  }, []);

  const observe = useCallback(
    (map: L.Map) => {
      roRef.current = new ResizeObserver(() => {
        const target = intentRef.current;
        if (!target) return;
        // Measure through the ref, not the observed entry: after a remount
        // the observer may still deliver for the old node.
        const inset = insetPx();
        if (inset === target.insetPx) return;
        target.insetPx = inset;
        const flyRemainingMs = target.flyEndsAt - Date.now();
        // Mid-flight the interpolated getZoom() is meaningless, so keep the
        // fly's destination zoom. At rest, follow the user's current zoom.
        const zoom = flyRemainingMs > 0 ? target.zoom : map.getZoom();
        target.zoom = zoom;
        const c = centerForBottomInset(target.lat, target.lon, zoom, inset);
        if (flyRemainingMs > 0) {
          map.flyTo([c.lat, c.lon], zoom, {
            duration: Math.max(flyRemainingMs, 300) / 1000,
          });
        } else {
          map.panTo([c.lat, c.lon], { animate: true });
        }
      });
      // The user dragging the map ends any auto-centre intent.
      map.on("dragstart", clear);
      ensureObserved();
      return () => {
        roRef.current?.disconnect();
        roRef.current = null;
        observedElRef.current = null;
      };
    },
    [clear, ensureObserved, insetPx],
  );

  return { visibleCenter, autoCenter, seed, clear, observe };
}
