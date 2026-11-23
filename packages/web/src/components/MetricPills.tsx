// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { MetricView } from "../types";
import { useT, type Key } from "../i18n";

interface PillsProps {
  view: MetricView;
  onSelect: (view: MetricView) => void;
  showWaves: boolean;
  showTides: boolean;
  showCurrents: boolean;
  /** The server's land mask put the spot on land: no sea tab, and a note
      where the tabs would be, so an empty card does not read as a bug. */
  onLand?: boolean;
}

interface PillDef {
  view: MetricView;
  label: Key;
  visible: boolean;
  icon: ReactNode;
}

// Wind: stacked airflow lines (mirrors the brand mark in Header).
const WindIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);

// Waves: two stacked sinusoids.
const WavesIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
    <path d="M2 13c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
    <path d="M2 20c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
  </svg>
);

// Tides: crescent moon (lunar driver).
const TidesIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// Currents: directional arrow with curved trail (flow).
const CurrentsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12c2-4 6-4 8 0s6 4 8 0" />
    <path d="M16 8l3 4-3 4" />
  </svg>
);

// Same width as the scroll fade of the tables below (`.scroll-container`).
const END_FADE_PX = 32;

/**
 * Fades the pills out over the last few pixels of the row instead of cutting
 * them at its edge, which on the explore map sits right against the locate
 * button: a pill sliced by a vertical line ("Co" for "Courants") read as a
 * rendering bug. The fade is as wide as what is still left to scroll, capped
 * at END_FADE_PX, so it shrinks to nothing as the last pill comes into view
 * and never touches a row that fits.
 *
 * The mask goes on each pill rather than on the row: a masked ancestor
 * becomes the backdrop root of the pills, and their glass blur would no
 * longer see the map underneath (#387).
 */
function fadeRowEnd(row: HTMLElement) {
  const hidden = row.scrollWidth - row.clientWidth - row.scrollLeft;
  const fade = hidden < 1 ? 0 : Math.min(END_FADE_PX, hidden);
  const edge = row.getBoundingClientRect().right;
  for (const pill of row.children) {
    if (!(pill instanceof HTMLElement)) continue;
    const { left, right } = pill.getBoundingClientRect();
    const mask =
      fade > 0 && right > edge - fade
        ? `linear-gradient(to right, #000 ${edge - fade - left}px, transparent ${edge - left}px)`
        : "";
    pill.style.setProperty("-webkit-mask-image", mask);
    pill.style.setProperty("mask-image", mask);
  }
}

export function MetricPills({
  view,
  onSelect,
  showWaves,
  showTides,
  showCurrents,
  onLand = false,
}: PillsProps) {
  const { t } = useT();
  const rowRef = useRef<HTMLDivElement>(null);
  const pills: PillDef[] = [
    { view: "wind", label: "explore.pills.wind", visible: true, icon: WindIcon },
    { view: "waves", label: "explore.pills.waves", visible: showWaves, icon: WavesIcon },
    { view: "tides", label: "explore.pills.tides", visible: showTides, icon: TidesIcon },
    {
      view: "currents",
      label: "explore.pills.currents",
      visible: showCurrents,
      icon: CurrentsIcon,
    },
  ];
  const visible = pills.filter((p) => p.visible);
  const visibleKey = onLand ? "" : visible.map((p) => p.view).join();

  // Re-run on scroll, and on any size change of the row or of a pill: a
  // phone turned sideways, the webfont landing, a language switch.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => fadeRowEnd(row);
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer) {
      observer.observe(row);
      for (const pill of row.children) observer.observe(pill);
    }
    return () => {
      row.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [visibleKey]);

  if (onLand) {
    return (
      <div className="flex px-3 py-2.5">
        <p
          role="status"
          className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            color: "var(--ow-fg-1)",
            background: "var(--ow-surface-glass)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--ow-line-2)",
            boxShadow: "var(--ow-shadow-1)",
          }}
        >
          {t("explore.pills.onLand")}
        </p>
      </div>
    );
  }
  if (visible.length <= 1) return null;
  return (
    <div
      ref={rowRef}
      className="flex gap-2 px-3 py-2.5 overflow-x-auto"
      role="tablist"
      aria-label={t("explore.pills.groupLabel")}
    >
      {visible.map((p) => {
        const active = p.view === view;
        return (
          <button
            key={p.view}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.view)}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            // The pills float over the map: on the same glass as the other
            // controls there. A bare outline let the basemap through, and in
            // the light theme its place names read as loud as the labels and
            // the pills as barely there (#387). The active tint is laid over
            // the glass, not instead of it.
            style={{
              color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
              background: active
                ? "linear-gradient(var(--ow-accent-soft), var(--ow-accent-soft)), var(--ow-surface-glass)"
                : "var(--ow-surface-glass)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${active ? "var(--ow-accent-line)" : "var(--ow-line-2)"}`,
              boxShadow: "var(--ow-shadow-1)",
            }}
          >
            <span aria-hidden className="shrink-0">{p.icon}</span>
            <span>{t(p.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
