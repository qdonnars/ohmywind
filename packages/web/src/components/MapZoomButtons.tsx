// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MapZoomStore } from "../utils/mapZoomStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useT } from "../i18n";

interface MapZoomButtonsProps {
  store: MapZoomStore;
  /** Positioning, left to the page like the other map controls. */
  className?: string;
  /** Room the group needs between its bottom and the bottom of the map
      frame (the control under it and its air). Short of it the group stands
      down: it would run into that control. Wheel, keyboard and pinch still
      zoom. Measured from where the group actually sits, which hangs from
      the bar over the map and so from the safe-area insets. */
  clearanceBelow?: number;
}

/**
 * Zoom in and out, for a mouse or a trackpad (#470). On a touch screen the
 * pinch does it and the map has no room to spare, so the group is not
 * rendered there. Drawn like the round controls of the map, as one capsule
 * of two halves, and disabled at either bound of the zoom.
 */
export function MapZoomButtons({ store, className = "", clearanceBelow = 0 }: MapZoomButtonsProps) {
  const { t } = useT();
  const fine = useMediaQuery("(pointer: fine)");
  const { canZoomIn, canZoomOut } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(true);

  // The frame is the positioned parent the group is laid out against. Its
  // height changes with the drawer of the planner, without any resize of
  // the window, hence an observer rather than a media query.
  useEffect(() => {
    const group = ref.current;
    const frame = group?.offsetParent;
    if (!group || !frame || clearanceBelow <= 0) return;
    const ro = new ResizeObserver(() =>
      setRoomy(frame.getBoundingClientRect().height >= group.offsetTop + group.offsetHeight + clearanceBelow),
    );
    ro.observe(frame);
    return () => ro.disconnect();
  }, [clearanceBelow, fine]);

  if (!fine) return null;

  const half =
    "w-full h-11 rounded-full flex items-center justify-center transition-opacity disabled:opacity-35 disabled:cursor-default enabled:hover:opacity-70";
  return (
    <div
      ref={ref}
      role="group"
      aria-label={t("explore.zoom.group")}
      data-map-zoom=""
      className={`ow-map-zoom absolute z-[400] w-12 flex flex-col rounded-full overflow-hidden shadow-lg ${className}`}
      style={{
        visibility: roomy ? undefined : "hidden",
        background: "var(--ow-surface-glass)",
        backdropFilter: "blur(8px)",
        border: "1px solid var(--ow-line-2)",
        color: "var(--ow-fg-1)",
      }}
    >
      <button
        type="button"
        onClick={store.zoomIn}
        disabled={!canZoomIn}
        aria-label={t("explore.zoom.in")}
        title={t("explore.zoom.in")}
        className={half}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span aria-hidden="true" className="block h-px mx-2.5" style={{ background: "var(--ow-line-2)" }} />
      <button
        type="button"
        onClick={store.zoomOut}
        disabled={!canZoomOut}
        aria-label={t("explore.zoom.out")}
        title={t("explore.zoom.out")}
        className={half}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
